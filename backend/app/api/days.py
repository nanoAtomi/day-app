"""Days and their blocks.

A day is created on first access - from today on as a copy of its weekday's template
(past days start empty: the plan must not pretend something happened). Blocks from a
calendar (source `calendar`) are read-only here: only their status can change. Every
query goes through the owner, so one person never sees or changes another person's day.
"""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import BLOCK_STATUSES, CATEGORIES, DELAY_MODES, Block, Day, Subtask, Template, User, WeekdayAssignment, utcnow
from .templates import own_template

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
    # False: not opened yet - a preview of what its template would bring (week view).
    stored: bool = True
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


class DayTemplateIn(BaseModel):
    # None = no template: the day keeps only its own and calendar blocks.
    template_id: int | None


class ModuleIn(BaseModel):
    template_id: int
    # Where the module's first block starts; the others keep their distance to it.
    start_minute: int = Field(ge=0, lt=DAY_MINUTES)


class DayUpdate(BaseModel):
    # fixed / cascade, or None for the user's default.
    delay_mode: str | None = None


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


def local_now(user: User) -> datetime:
    """Now on the user's wall clock (tests replace it)."""
    return datetime.now(ZoneInfo(user.timezone))


def today(user: User) -> date:
    return local_now(user).date()


def weekday_template(db: Session, user: User, on: date) -> Template | None:
    """The day template the date's weekday starts from - only from today on."""
    if on < today(user):
        return None
    assignment = db.get(WeekdayAssignment, (user.id, on.weekday()))
    return db.get(Template, assignment.template_id) if assignment else None


def copy_blocks(template: Template, shift: int = 0, source: str = "template") -> list[Block]:
    """Copies of a template's blocks - changing them never changes the template."""
    blocks = []
    for tb in template.blocks:
        block = Block(
            start_minute=tb.start_minute + shift,
            end_minute=tb.start_minute + shift + tb.duration_minutes,
            title=tb.title,
            category=tb.category,
            source=source,
            status="open",
        )
        block.subtasks = [Subtask(title=title, position=i) for i, title in enumerate(tb.subtasks or [])]
        blocks.append(block)
    return blocks


def get_or_create_day(db: Session, user: User, on: date) -> Day:
    day = db.scalar(select(Day).where(Day.owner_id == user.id, Day.date == on))
    if day is not None:
        return day
    template = weekday_template(db, user, on)
    day = Day(owner_id=user.id, date=on, template_id=template.id if template else None)
    if template:
        day.blocks = copy_blocks(template)
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


MAX_RANGE_DAYS = 14


@router.get("/days", response_model=list[DayOut])
def list_days(
    start: date = Query(alias="from"),
    days: int = Query(default=7, ge=1, le=MAX_RANGE_DAYS),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[DayOut]:
    """Several days at once (week view). Days not opened yet are previews - nothing is
    stored, so a template changed in the meantime still applies when the day is opened."""
    end = start + timedelta(days=days - 1)
    stored = {d.date: d for d in db.scalars(select(Day).where(Day.owner_id == user.id, Day.date >= start, Day.date <= end))}
    result = []
    for i in range(days):
        on = start + timedelta(days=i)
        if on in stored:
            result.append(_day(stored[on], user))
            continue
        template = weekday_template(db, user, on)
        preview = copy_blocks(template) if template else []
        result.append(
            DayOut(
                date=on,
                stored=False,
                template_id=template.id if template else None,
                delay_mode=user.delay_mode,
                delay_mode_override=None,
                blocks=[
                    BlockOut(id=-(n + 1), start_minute=b.start_minute, end_minute=b.end_minute, title=b.title, category=b.category,
                             source=b.source, status=b.status, actual_start=None, actual_end=None, subtasks=[])
                    for n, b in enumerate(preview)
                ],
            )
        )
    return result


@router.put("/days/{on}/template", response_model=DayOut)
def set_day_template(on: date, body: DayTemplateIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> DayOut:
    """Switches the day to another template: the blocks of the old one go, the new one's
    come in; blocks added by hand (modules too) and calendar blocks stay."""
    template = own_template(db, user, body.template_id, kind="day") if body.template_id is not None else None
    day = get_or_create_day(db, user, on)
    for block in [b for b in day.blocks if b.source == "template"]:
        day.blocks.remove(block)
    day.template_id = template.id if template else None
    if template:
        day.blocks.extend(copy_blocks(template))
    db.commit()
    db.refresh(day)
    return _day(day, user)


@router.post("/days/{on}/modules", response_model=DayOut, status_code=201)
def insert_module(on: date, body: ModuleIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> DayOut:
    """Inserts a module (e.g. training) into the day; its blocks count as the day's own."""
    module = own_template(db, user, body.template_id, kind="module")
    if not module.blocks:
        raise HTTPException(status_code=422, detail="The module has no blocks")
    shift = body.start_minute - min(b.start_minute for b in module.blocks)
    if max(b.start_minute + b.duration_minutes for b in module.blocks) + shift > DAY_MINUTES:
        raise HTTPException(status_code=422, detail="The module would run past midnight")
    day = get_or_create_day(db, user, on)
    day.blocks.extend(copy_blocks(module, shift=shift, source="manual"))
    db.commit()
    db.refresh(day)
    return _day(day, user)


@router.patch("/days/{on}", response_model=DayOut)
def update_day(on: date, body: DayUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)) -> DayOut:
    day = get_or_create_day(db, user, on)
    if "delay_mode" in body.model_fields_set:
        if body.delay_mode is not None and body.delay_mode not in DELAY_MODES:
            raise HTTPException(status_code=422, detail=f"delay_mode must be one of {', '.join(DELAY_MODES)}")
        day.delay_mode = body.delay_mode
    db.commit()
    db.refresh(day)
    return _day(day, user)


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
    old_start, old_end = block.start_minute, block.end_minute
    block.start_minute, block.end_minute = start, end
    if "status" in changes:
        _set_status(block, changes["status"])

    day = block.day
    if (day.delay_mode or user.delay_mode) == "cascade" and block.source != "calendar":
        if start == old_start and end > old_end:
            # Running over (+15 min, the edge pulled down): what comes after moves back.
            push_following(day, block, old_end, end)
        elif changes.get("status") == "done" and day.date == today(user):
            # Done late: the rest of the day starts from now.
            now = local_now(user)
            minute = now.hour * 60 + now.minute
            if minute > end:
                push_following(day, block, end, minute)
    db.commit()
    db.refresh(block)
    return _block(block)


def push_following(day: Day, block: Block, old_end: int, new_end: int) -> None:
    """Delay mode `cascade`: the open blocks after `block` move back just as far as they
    have to so nothing overlaps - a gap in the plan absorbs the delay. Blocks running
    beside it, finished ones and calendar entries stay where they are."""
    following = sorted(
        (b for b in day.blocks if b is not block and b.start_minute >= old_end and b.status == "open" and b.source != "calendar"),
        key=lambda b: (b.start_minute, b.id),
    )
    edge = new_end
    for b in following:
        if b.start_minute >= edge:
            break
        length = b.end_minute - b.start_minute
        # Nothing runs past midnight: the last blocks get squeezed, at least 5 minutes long.
        b.start_minute = min(edge, DAY_MINUTES - MIN_BLOCK_MINUTES)
        b.end_minute = min(b.start_minute + length, DAY_MINUTES)
        edge = b.end_minute


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
