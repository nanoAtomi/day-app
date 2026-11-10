"""Subtasks of a day's block: add, tick off, rename, delete. Reached only through the
block's day and its owner; calendar blocks are read-only and get none."""
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import Block, Day, Subtask, User
from .days import SubtaskOut, _own_block

router = APIRouter(prefix="/api", tags=["subtasks"])

MAX_SUBTASKS = 30


class SubtaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class SubtaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    done: bool | None = None


def _out(subtask: Subtask) -> SubtaskOut:
    return SubtaskOut(id=subtask.id, title=subtask.title, done=subtask.done)


def _own_subtask(db: Session, user: User, subtask_id: int) -> Subtask:
    subtask = db.scalar(
        select(Subtask).join(Block).join(Day).where(Subtask.id == subtask_id, Day.owner_id == user.id)
    )
    if subtask is None:
        raise HTTPException(status_code=404, detail="Subtask not found")
    return subtask


@router.post("/blocks/{block_id}/subtasks", response_model=SubtaskOut, status_code=201)
def add_subtask(block_id: int, body: SubtaskCreate, user: User = Depends(current_user), db: Session = Depends(get_db)) -> SubtaskOut:
    block = _own_block(db, user, block_id)
    if block.source == "calendar":
        raise HTTPException(status_code=409, detail="Calendar blocks are read-only")
    if len(block.subtasks) >= MAX_SUBTASKS:
        raise HTTPException(status_code=422, detail=f"At most {MAX_SUBTASKS} subtasks per block")
    position = (db.scalar(select(func.max(Subtask.position)).where(Subtask.block_id == block.id)) or 0) + 1
    subtask = Subtask(block_id=block.id, title=body.title.strip(), position=position)
    db.add(subtask)
    db.commit()
    return _out(subtask)


@router.patch("/subtasks/{subtask_id}", response_model=SubtaskOut)
def update_subtask(subtask_id: int, body: SubtaskUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)) -> SubtaskOut:
    subtask = _own_subtask(db, user, subtask_id)
    if body.title is not None:
        subtask.title = body.title.strip()
    if body.done is not None:
        subtask.done = body.done
    db.commit()
    return _out(subtask)


@router.delete("/subtasks/{subtask_id}", status_code=204)
def delete_subtask(subtask_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    db.delete(_own_subtask(db, user, subtask_id))
    db.commit()
    return Response(status_code=204)
