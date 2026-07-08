"""Pydantic models for CardForge JSON data validation."""

from pydantic import BaseModel, Field
from typing import Optional


class EffectInvocation(BaseModel):
    effectId: str = ""
    value: int = 0
    secondaryValue: int = 0
    overrideTarget: str = ""
    repeat: int = 1
    conditionExpression: Optional[str] = None
    parameters: dict[str, str] = Field(default_factory=dict)


class CardRow(BaseModel):
    id: str
    nameKey: str
    descriptionKey: str = ""
    type: str = "Attack"
    rarity: str = "Basic"
    element: str = "None"
    cost: int = 0
    targetType: str = "None"
    exhaust: bool = False
    ethereal: bool = False
    innate: bool = False
    keywordIds: list[str] = Field(default_factory=list)
    effects: list[EffectInvocation] = Field(default_factory=list)
    customData: dict[str, int] = Field(default_factory=dict)


class EffectRow(BaseModel):
    id: str
    executorType: str
    displayNameKey: str = ""
    defaultParams: dict[str, str] = Field(default_factory=dict)


class BuffRow(BaseModel):
    id: str
    handlerType: str
    nameKey: str = ""
    descriptionKey: str = ""
    stackPolicy: str = "Additive"
    maxStacks: int = 99
    isDebuff: bool = False
    params: dict[str, str] = Field(default_factory=dict)


class CharacterRow(BaseModel):
    id: str
    nameKey: str
    maxHp: int = 80
    maxMana: int = 3
    startingMana: int = 3
    manaGrowthPerTurn: int = 1
    handSize: int = 5
    maxHandSize: int = 10
    startingDeck: list[str] = Field(default_factory=list)
    innateBuffIds: list[str] = Field(default_factory=list)


class GameModeRow(BaseModel):
    id: str
    nameKey: str
    maxPlayers: int = 2
    phaseOrder: list[str] = Field(default_factory=list)
    rules: dict[str, str] = Field(default_factory=dict)


class KeywordRow(BaseModel):
    id: str
    nameKey: str
    descriptionKey: str
