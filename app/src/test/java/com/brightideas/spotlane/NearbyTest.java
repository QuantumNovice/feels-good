package com.brightideas.spotlane;

import static org.junit.Assert.*;

import java.util.*;
import org.json.*;
import org.junit.Test;

public class NearbyTest {
  @Test
  public void streamsRecordsWithoutMaterializingTheArray() throws Exception {
    List<String> ids = new ArrayList<>();
    Nearby.stream("[{\"id\":\"a\"},{\"id\":\"b\"}]", p -> ids.add(p.optString("id")));
    assertEquals(Arrays.asList("a", "b"), ids);
  }

  @Test
  public void handlesEmptyAndRejectsMalformedSources() throws Exception {
    Nearby.stream("[]", p -> fail());
    try {
      Nearby.stream("[1]", p -> fail());
      fail();
    } catch (JSONException expected) {
    }
  }

  @Test
  public void distanceSeparatesSuwonFromSeoul() {
    assertEquals(0, Nearby.distance(37.285, 127.01, 37.285, 127.01), .001);
    assertTrue(Nearby.distance(37.285, 127.01, 37.5665, 126.978) > 30000);
  }
}
