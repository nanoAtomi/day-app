"""Days and their blocks.

A day is created on first access. Blocks from a calendar (source `calendar`) are
read-only here: only their status can change. Every query goes through the owner, so
one person never sees or changes another person's day.
"""
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import BLOCK_STATUSES, CATEGORIES, Block, Day, User, utcnow

router = APIRouter(prefix="/api", tags=["days"])

DAY_MINUTES = 24 * 60
MIN_BLOCK_MINUTES = 5


class SubtaskOut(BaseModel):
    id: int
    title: str
    done: bool


class BlockOut(BaseModel):
    id: int
    start_minute: int
    end_minute: int
    title: str
    category: str
    source: str
    status: str
    actual_start: datetime | None
    actual_end: datetime | None
    subtasks: list[SubtaskOut]


class DayOut(BaseModel):
    date: date
    template_id: int | None
    # The mode in effect, and the day's own choice (None = the user's default).
    delay_mode: str
    delay_mode_override: str | None
    blocks: list[BlockOut]


class BlockTimes(BaseModel):
    start_minute: int | None = Field(default=None, ge=0, lt=DAY_MINUTES)
    end_minute: int | None = Field(default=None, gt=0, le=DAY_MINUTES)


class BlockCreate(BlockTimes):
    start_minute: int = Field(ge=0, lt=DAY_MINUTES)
    end_minute: int = Field(gt=0, le=DAY_MINUTES)
    title: str = Field(min_length=1, max_length=200)
    category: str = "other"

    @model_validator(mode="after")
    def _check(self):
        _check_category(self.category)
        _check_span(self.start_minute, self.end_minute)
        return self


class BlockUpdate(BlockTimes):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = None
    status: str | None = None


def _check_category(category: str) -> None:
    if category not in CATEGORIES:
        raise ValueError(f"category must be one of {', '.join(CATEGORIES)}")


def _check_span(start: int, end: int) -> None:
    if end - start < MIN_BLOCK_MINUTES:
        raise ValueError(f"a block ends at least {MIN_BLOCK_MINUTES} minutes after it starts")


def _block(block: Block) -> BlockOut:
    return BlockOut(
        id=block.id,
        start_minute=block.start_minute,
        end_minute=block.end_minute,
        title=block.title,
        category=block.category,
        source=block.source,
        status=block.status,
        actual_start=block.actual_start,
        actual_end=block.actual_end,
        subtasks=[SubtaskOut(id=s.id, title=s.title, done=s.done) for s in block.subtasks],
    )


def _day(day: Day, user: User) -> DayOut:
    return DayOut(
        date=day.date,
        template_id=day.template_id,
        delay_mode=day.delay_mode or user.delay_mode,
        delay_mode_override=day.delay_mode,
        blocks=[_block(b) for b in day.blocks],
    )


def get_or_create_day(db: Session, user: User, on: date) -> Day:
    day = db.scalar(select(Day).where(Day.owner_id == user.id, Day.date == on))
    if day is not None:
        return day
    day = Day(owner_id=user.id, date=on)
    db.add(day)
    try:
        db.commit()
    except IntegrityError:
        # Two tabs opened the same new day at once - the other one won.
        db.rollback()
        day = db.scalar(select(Day).where(Day.owner_id == user.id, Day.date == on))
    return day


def _own_block(db: Session, user: User, block_id: int) -> Block:
    block = db.scalar(select(Block).join(Day).where(Block.id == block_id, Day.owner_id == user.id))
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    return block


@router.get("/days/{on}", response_model=DayOut)
def get_day(on: date, user: User = Depends(current_user), db: Session = Depends(get_db)) -> DayOut:
    return _day(get_or_create_day(db, user, on), user)


@router.post("/days/{on}/blocks", response_model=BlockOut, status_code=201)
def create_block(on: date, body: BlockCreate, user: User = Depends(current_user), db: Session = Depends(get_db)) -> BlockOut:
    day = get_or_create_day(db, user, on)
    block = Block(
        day_id=day.id,
        start_minute=body.start_minute,
        end_minute=body.end_minute,
        title=body.title.strip(),
        category=body.category,
        source="manual",
        status="open",
    )
    db.add(block)
    db.commit()
    db.refresh(block)
    return _block(block)


@router.patch("/blocks/{block_id}", response_model=BlockOut)
def update_block(block_id: int, body: BlockUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)) -> BlockOut:
    block = _own_block(db, user, block_id)
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if block.source == "calendar" and set(changes) - {"status"}:
        raise HTTPException(status_code=409, detail="Calendar blocks are read-only")

    if "category" in changes:
        try:
            _check_category(changes["category"])
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e)) from None
    start = changes.get("start_minute", block.start_minute)
    end = changes.get("end_minute", block.end_minute)
    try:
        _check_span(start, end)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from None

    if "title" in changes:
        block.title = changes["title"].strip()
    if "category" in changes:
        block.category = changes["category"]
    block.start_minute, block.end_minute = start, end
    if "status" in changes:
        _set_status(block, changes["status"])
    db.commit()
    db.refresh(block)
    return _block(block)


def _set_status(block: Block, status: str) -> None:
    if status not in BLOCK_STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {', '.join(BLOCK_STATUSES)}")
    block.status = status
    # When it was ticked off - the statistics compare it with the plan.
    block.actual_end = utcnow() if status == "done" else None


@router.delete("/blocks/{block_id}", status_code=204)
def delete_block(block_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    block = _own_block(db, user, block_id)
    if block.source == "calendar":
        raise HTTPException(status_code=409, detail="Calendar blocks are read-only")
    db.delete(block)
    db.commit()
    return Response(status_code=204)
