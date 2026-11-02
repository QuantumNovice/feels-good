package com.brightideas.spotlane;

import static org.junit.Assert.*;

import org.json.*;
import org.junit.Test;

public class DatasetTest {
  private JSONObject place() throws Exception {
    return new JSONObject(
        "{\"id\":\"a\",\"name\":\"WC\",\"source\":\"OSM\",\"category\":\"bathroom\",\"latitude\":37.5,\"longitude\":127}");
  }

  @Test
  public void acceptsUnverifiedSource() throws Exception {
    assertEquals(1, Dataset.validate(new JSONArray().put(place()).toString()).length());
  }

  @Test
  public void acceptsParkingLayerWithoutPretendingCapacityIsAvailability() throws Exception {
    JSONObject p =
        place()
            .put("category", "parking")
            .put("parking", new JSONObject().put("capacity", 50).put("paid", true));
    assertEquals(
        50,
        Dataset.validate(new JSONArray().put(p).toString())
            .getJSONObject(0)
            .getJSONObject("parking")
            .getInt("capacity"));
  }

  @Test
  public void rejectsDuplicateIds() throws Exception {
    assertThrows(
        Exception.class,
        () -> Dataset.validate(new JSONArray().put(place()).put(place()).toString()));
  }

  @Test
  public void rejectsInvalidCoordinates() throws Exception {
    assertThrows(
        Exception.class,
        () -> Dataset.validate(new JSONArray().put(place().put("latitude", 91)).toString()));
  }

  @Test
  public void requiresVerificationEvidence() throws Exception {
    assertThrows(
        Exception.class,
        () -> Dataset.validate(new JSONArray().put(place().put("verified", true)).toString()));
  }

  @Test
  public void rejectsMissingProvenance() throws Exception {
    assertThrows(
        Exception.class,
        () -> Dataset.validate(new JSONArray().put(place().put("source", "")).toString()));
  }

  @Test
  public void eventsRequireExpiry() throws Exception {
    assertThrows(
        Exception.class,
        () -> Dataset.validate(new JSONArray().put(place().put("category", "event")).toString()));
  }

  @Test
  public void normalizesOsmAndPreservesUnknownFacilities() throws Exception {
    JSONArray result =
        OsmSource.normalize(
            "{\"elements\":[{\"type\":\"node\",\"id\":1,\"lat\":37.5,\"lon\":127,\"tags\":{\"amenity\":\"toilets\",\"wheelchair\":\"yes\"}}]}");
    assertFalse(result.getJSONObject(0).getBoolean("verified"));
    assertEquals(
        "yes", result.getJSONObject(0).getJSONObject("facilities").getString("wheelchair"));
    assertFalse(result.getJSONObject(0).getJSONObject("facilities").has("opening_hours"));
  }

  @Test
  public void popupsRequireExpiry() throws Exception {
    assertThrows(
        Exception.class,
        () -> Dataset.validate(new JSONArray().put(place().put("category", "popup")).toString()));
  }

  @Test
  public void timedRecordsRejectEndBeforeStart() throws Exception {
    JSONObject p =
        place()
            .put("category", "popup")
            .put("startsAt", "2026-10-28T00:00:00Z")
            .put("endsAt", "2026-10-27T00:00:00Z");
    assertThrows(Exception.class, () -> Dataset.validate(new JSONArray().put(p).toString()));
  }

  @Test
  public void acceptsKoreanMidnightAsExclusiveEnd() throws Exception {
    JSONObject p = place().put("category", "popup").put("endsAt", "2026-10-28T00:00:00+09:00");
    assertEquals(1, Dataset.validate(new JSONArray().put(p).toString()).length());
  }
}
