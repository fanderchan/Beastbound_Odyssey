"use strict";

const DEFAULT_CHARACTER_ELEMENTS = Object.freeze({earth: 6, water: 4, fire: 0, wind: 0});

function registerSelectedCharacterFixture(service, options = {}) {
  if (!service || typeof service.register !== "function") {
    throw new TypeError("selected-character fixture requires an auth service");
  }
  const username = String(options.username || "").trim();
  const displayName = String(options.displayName || username).trim();
  const slotIndex = Number.isSafeInteger(options.slotIndex) ? options.slotIndex : 0;
  const registered = service.register({
    username,
    password: String(options.password || "test1234"),
    displayName,
  });
  assertFixtureResult(registered, "registration", username);
  if (
    registered.selectionRequired !== true
    || registered.selectedCharacter !== null
    || !Array.isArray(registered.characters)
    || registered.characters.length !== 4
    || registered.characters.some((entry) => !entry || entry.occupied !== false)
  ) {
    throw new Error(`selected-character fixture ${username} did not register with four empty slots`);
  }

  const created = service.createCharacter(registered.session.token, {
    slotIndex,
    appearanceId: String(options.appearanceId || "novice_hunter_v1"),
    displayName: String(options.characterDisplayName || displayName),
    elements: {...(options.elements || DEFAULT_CHARACTER_ELEMENTS)},
  });
  assertFixtureResult(created, "character creation", username);
  if (
    created.selectionRequired !== true
    || created.selectedCharacter !== null
    || !created.character
    || String(created.character.playerId || "") === ""
    || created.character.slotIndex !== slotIndex
  ) {
    throw new Error(`selected-character fixture ${username} bypassed the explicit selection gate`);
  }

  const selected = service.selectCharacter(registered.session.token, {
    slotIndex,
    playerId: created.character.playerId,
  });
  assertFixtureResult(selected, "character selection", username);
  if (
    selected.selectionRequired !== false
    || !selected.session
    || String(selected.session.token || "") === ""
    || selected.session.token === registered.session.token
    || String(selected.session.playerId || "") !== created.character.playerId
    || !selected.selectedCharacter
    || selected.selectedCharacter.selected !== true
  ) {
    throw new Error(`selected-character fixture ${username} did not rotate into the created character`);
  }
  return {
    ...registered,
    session: selected.session,
    selectionRequired: false,
    characters: selected.characters,
    selectedCharacter: selected.selectedCharacter,
    character: selected.selectedCharacter,
    profileBinding: selected.profileBinding,
    profileSummary: selected.profileSummary,
  };
}

function assertFixtureResult(result, stage, username) {
  if (result && result.ok) {
    return;
  }
  const code = String(result && result.code || "unknown_failure");
  throw new Error(`selected-character fixture ${username} ${stage} failed: ${code}`);
}

module.exports = {
  DEFAULT_CHARACTER_ELEMENTS,
  registerSelectedCharacterFixture,
};
