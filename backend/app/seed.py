"""Starter templates every user gets once: office day, home office, weekend and the
training module; Monday to Friday start from the office day, the weekend from the weekend.
They are plain test data - everyone changes them to their own day."""
from sqlalchemy.orm import Session

from .models import Template, TemplateBlock, User, WeekdayAssignment


def _t(hhmm: str) -> int:
    hours, minutes = hhmm.split(":")
    return int(hours) * 60 + int(minutes)


# (start, end, title, category, subtasks)
OFFICE = [
    ("7:00", "7:30", "Frühstück", "meal", []),
    ("7:30", "8:00", "Bad/Anziehen", "care", []),
    ("8:00", "9:00", "Arbeitsweg", "commute", []),
    ("9:00", "17:00", "Arbeit", "work", []),
    ("17:00", "18:00", "Heimweg", "commute", []),
    ("18:00", "19:00", "Kochen", "meal", []),
    ("19:00", "19:30", "Essen", "meal", []),
    ("19:30", "22:30", "Freizeit", "leisure", []),
]
HOME_OFFICE = [
    ("7:30", "8:00", "Frühstück", "meal", []),
    ("8:00", "8:30", "Bad/Anziehen", "care", []),
    ("8:30", "12:30", "Arbeit", "work", []),
    ("12:30", "13:30", "Mittagspause", "meal", []),
    ("13:30", "17:00", "Arbeit", "work", []),
    ("17:00", "18:00", "Haushalt", "chores", []),
    ("18:00", "19:00", "Kochen", "meal", []),
    ("19:00", "19:30", "Essen", "meal", []),
    ("19:30", "22:30", "Freizeit", "leisure", []),
]
WEEKEND = [
    ("9:00", "10:00", "Frühstück", "meal", []),
    ("10:00", "10:30", "Bad/Anziehen", "care", []),
    ("10:30", "12:00", "Haushalt", "chores", []),
    ("12:30", "13:30", "Mittagessen", "meal", []),
    ("13:30", "18:00", "Freizeit", "leisure", []),
    ("18:00", "19:00", "Kochen", "meal", []),
    ("19:00", "19:30", "Essen", "meal", []),
    ("19:30", "23:00", "Freizeit", "leisure", []),
]
TRAINING = [
    ("18:00", "18:15", "Anfahrt", "commute", []),
    ("18:15", "19:30", "Training", "sport", ["Aufwärmen", "Kraft", "Dehnen"]),
    ("19:30", "19:45", "Duschen", "care", []),
]

TEMPLATES = [
    # name, icon, colour, kind, blocks, weekdays (0 = Monday)
    ("Bürotag", "💼", "blue", "day", OFFICE, [0, 1, 2, 3, 4]),
    ("Homeoffice", "🏠", "teal", "day", HOME_OFFICE, []),
    ("Wochenende", "🌤️", "amber", "day", WEEKEND, [5, 6]),
    ("Training", "🏋️", "rose", "module", TRAINING, []),
]


def seed_templates(db: Session, user: User) -> None:
    """Creates the starter templates the first time; a no-op afterwards."""
    if user.templates_seeded:
        return
    for name, icon, color, kind, blocks, weekdays in TEMPLATES:
        template = Template(owner_id=user.id, name=name, icon=icon, color=color, kind=kind)
        template.blocks = [
            TemplateBlock(start_minute=_t(start), duration_minutes=_t(end) - _t(start), title=title, category=category, subtasks=subtasks)
            for start, end, title, category, subtasks in blocks
        ]
        db.add(template)
        db.flush()
        for weekday in weekdays:
            db.merge(WeekdayAssignment(owner_id=user.id, weekday=weekday, template_id=template.id))
    user.templates_seeded = True
    db.commit()
