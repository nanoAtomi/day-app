"""Templates (whole days and modules), their blocks, and which weekday starts from which
day template. Everything is reached through its owner."""
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import CATEGORIES, TEMPLATE_KINDS, Template, TemplateBlock, User, WeekdayAssignment

router = APIRouter(prefix="/api", tags=["templates"])

DAY_MINUTES = 24 * 60
MIN_BLOCK_MINUTES = 5
COLORS = ("blue", "teal", "amber", "rose", "violet", "slate")


class TemplateBlockOut(BaseModel):
    id: int
    start_minute: int
    duration_minutes: int
    title: str
    category: str
    subtasks: list[str]


class TemplateOut(BaseModel):
    id: int
    name: str
    color: str
    icon: str
    kind: str
    # Weekdays (0 = Monday) that start from this template.
    weekdays: list[int]
    blocks: list[TemplateBlockOut]


class TemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    color: str = "blue"
    icon: str = Field(default="", max_length=16)
    kind: str = "day"


class TemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    color: str | None = None
    icon: str | None = Field(default=None, max_length=16)


class TemplateBlockIn(BaseModel):
    start_minute: int = Field(ge=0, lt=DAY_MINUTES)
    duration_minutes: int = Field(ge=MIN_BLOCK_MINUTES, le=DAY_MINUTES)
    title: str = Field(min_length=1, max_length=200)
    category: str = "other"
    subtasks: list[str] = Field(default_factory=list, max_length=30)


class TemplateBlockUpdate(BaseModel):
    start_minute: int | None = Field(default=None, ge=0, lt=DAY_MINUTES)
    duration_minutes: int | None = Field(default=None, ge=MIN_BLOCK_MINUTES, le=DAY_MINUTES)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = None
    subtasks: list[str] | None = Field(default=None, max_length=30)


class WeekdayIn(BaseModel):
    # None = the weekday starts empty.
    template_id: int | None


def _check(condition: bool, detail: str) -> None:
    if not condition:
        raise HTTPException(status_code=422, detail=detail)


def _clean_subtasks(titles: list[str]) -> list[str]:
    return [t.strip()[:200] for t in titles if t.strip()]


def _out(template: Template, weekdays: list[int]) -> TemplateOut:
    return TemplateOut(
        id=template.id,
        name=template.name,
        color=template.color,
        icon=template.icon,
        kind=template.kind,
        weekdays=sorted(weekdays),
        blocks=[
            TemplateBlockOut(id=b.id, start_minute=b.start_minute, duration_minutes=b.duration_minutes, title=b.title, category=b.category, subtasks=list(b.subtasks or []))
            for b in template.blocks
        ],
    )


def _weekdays(db: Session, user: User) -> dict[int, int]:
    """weekday -> template id"""
    return {w.weekday: w.template_id for w in db.scalars(select(WeekdayAssignment).where(WeekdayAssignment.owner_id == user.id))}


def own_template(db: Session, user: User, template_id: int, kind: str | None = None) -> Template:
    template = db.scalar(select(Template).where(Template.id == template_id, Template.owner_id == user.id))
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    if kind and template.kind != kind:
        raise HTTPException(status_code=422, detail=f"Template is not a {kind} template")
    return template


def _template_out(db: Session, user: User, template: Template) -> TemplateOut:
    return _out(template, [day for day, tid in _weekdays(db, user).items() if tid == template.id])


@router.get("/templates", response_model=list[TemplateOut])
def list_templates(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[TemplateOut]:
    weekdays = _weekdays(db, user)
    templates = db.scalars(select(Template).where(Template.owner_id == user.id).order_by(Template.kind, Template.id)).all()
    return [_out(t, [day for day, tid in weekdays.items() if tid == t.id]) for t in templates]


@router.post("/templates", response_model=TemplateOut, status_code=201)
def create_template(body: TemplateCreate, user: User = Depends(current_user), db: Session = Depends(get_db)) -> TemplateOut:
    _check(body.kind in TEMPLATE_KINDS, f"kind must be one of {', '.join(TEMPLATE_KINDS)}")
    _check(body.color in COLORS, f"color must be one of {', '.join(COLORS)}")
    template = Template(owner_id=user.id, name=body.name.strip(), color=body.color, icon=body.icon.strip(), kind=body.kind)
    db.add(template)
    db.commit()
    db.refresh(template)
    return _out(template, [])


@router.get("/templates/{template_id}", response_model=TemplateOut)
def get_template(template_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> TemplateOut:
    return _template_out(db, user, own_template(db, user, template_id))


@router.patch("/templates/{template_id}", response_model=TemplateOut)
def update_template(template_id: int, body: TemplateUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)) -> TemplateOut:
    template = own_template(db, user, template_id)
    if body.name is not None:
        template.name = body.name.strip()
    if body.color is not None:
        _check(body.color in COLORS, f"color must be one of {', '.join(COLORS)}")
        template.color = body.color
    if body.icon is not None:
        template.icon = body.icon.strip()
    db.commit()
    return _template_out(db, user, template)


@router.delete("/templates/{template_id}", status_code=204)
def delete_template(template_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    # Days made from it keep their blocks (they are copies); weekdays using it start empty.
    db.delete(own_template(db, user, template_id))
    db.commit()
    return Response(status_code=204)


@router.post("/templates/{template_id}/blocks", response_model=TemplateOut, status_code=201)
def add_template_block(template_id: int, body: TemplateBlockIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> TemplateOut:
    template = own_template(db, user, template_id)
    _check(body.category in CATEGORIES, f"category must be one of {', '.join(CATEGORIES)}")
    _check(body.start_minute + body.duration_minutes <= DAY_MINUTES, "a block ends at 24:00 at the latest")
    template.blocks.append(
        TemplateBlock(start_minute=body.start_minute, duration_minutes=body.duration_minutes, title=body.title.strip(), category=body.category, subtasks=_clean_subtasks(body.subtasks))
    )
    db.commit()
    db.refresh(template)
    return _template_out(db, user, template)


def _own_template_block(db: Session, user: User, block_id: int) -> TemplateBlock:
    block = db.scalar(select(TemplateBlock).join(Template).where(TemplateBlock.id == block_id, Template.owner_id == user.id))
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    return block


@router.patch("/template-blocks/{block_id}", response_model=TemplateOut)
def update_template_block(block_id: int, body: TemplateBlockUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)) -> TemplateOut:
    block = _own_template_block(db, user, block_id)
    if body.category is not None:
        _check(body.category in CATEGORIES, f"category must be one of {', '.join(CATEGORIES)}")
        block.category = body.category
    start = body.start_minute if body.start_minute is not None else block.start_minute
    duration = body.duration_minutes if body.duration_minutes is not None else block.duration_minutes
    _check(start + duration <= DAY_MINUTES, "a block ends at 24:00 at the latest")
    block.start_minute, block.duration_minutes = start, duration
    if body.title is not None:
        block.title = body.title.strip()
    if body.subtasks is not None:
        block.subtasks = _clean_subtasks(body.subtasks)
    db.commit()
    template = block.template
    db.refresh(template)
    return _template_out(db, user, template)


@router.delete("/template-blocks/{block_id}", response_model=TemplateOut)
def delete_template_block(block_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> TemplateOut:
    block = _own_template_block(db, user, block_id)
    template = block.template
    db.delete(block)
    db.commit()
    db.refresh(template)
    return _template_out(db, user, template)


@router.put("/weekdays/{weekday}", status_code=204)
def set_weekday(weekday: int, body: WeekdayIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    _check(0 <= weekday <= 6, "weekday is 0 (Monday) to 6 (Sunday)")
    current = db.get(WeekdayAssignment, (user.id, weekday))
    if body.template_id is None:
        if current is not None:
            db.delete(current)
    else:
        own_template(db, user, body.template_id, kind="day")
        if current is None:
            db.add(WeekdayAssignment(owner_id=user.id, weekday=weekday, template_id=body.template_id))
        else:
            current.template_id = body.template_id
    db.commit()
    return Response(status_code=204)
