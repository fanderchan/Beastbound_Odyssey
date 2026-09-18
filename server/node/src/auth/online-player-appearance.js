"use strict";

// Read only the active authoritative profile. Never accept visual state from a
// movement payload or include pet instance IDs, stats, or private profile data.
function publicOnlineAppearance(profile, normalizeAppearanceId) {
  const source = record(profile);
  const player = record(source.player);
  const rideId = String(source.ridePetInstanceId || "").trim();
  let ridingFormId = "";
  if (rideId) {
    const collections = [source.petInstances, source.pets].filter(Array.isArray);
    for (const pets of collections) {
      const pet = pets.find((value) => {
        const candidate = record(value);
        return [candidate.instanceId, candidate.petId, candidate.id].some((id) => id === rideId);
      });
      if (!pet) continue;
      const state = String(pet.state || pet.status || pet.battleState || "");
      if (state === "riding" && (pet.hp == null || Number(pet.hp) > 0)) {
        ridingFormId = String(pet.formId || pet.templateId || pet.speciesId || "").trim();
      }
      break;
    }
  }
  return {appearanceId: normalizeAppearanceId(player.appearanceId), ridingFormId};
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function createOnlineAppearancePublisher({normalizeAppearanceId, publish}) {
  return (data, account, beforeProfile, afterProfile) => {
    const before = publicOnlineAppearance(beforeProfile, normalizeAppearanceId);
    const after = publicOnlineAppearance(afterProfile, normalizeAppearanceId);
    if (before.appearanceId === after.appearanceId && before.ridingFormId === after.ridingFormId) return false;
    const position = record(data.playerPositions)[account.accountId];
    if (!position) return false;
    // Republish the existing authoritative position; do not move the player or
    // promote map-only presence to a public cell when mounting at rest.
    publish(data, account, position);
    return true;
  };
}

module.exports = {publicOnlineAppearance, createOnlineAppearancePublisher};
