package com.brightideas.spotlane;

import static org.junit.Assert.*;
import org.junit.Test;
import java.time.Instant;

public class SourceUrlTest {
  @Test public void normalizesGithubFile() {
    assertEquals("https://raw.githubusercontent.com/alice/places/main/places.json",SourceUrl.normalize("https://github.com/alice/places/blob/main/places.json"));
  }
  @Test public void resolvesRepositoryWithoutGuessingBranch() {
    assertEquals("https://api.github.com/repos/alice/places/contents/data/places.json",SourceUrl.normalize("https://github.com/alice/places","data/places.json"));
  }
  @Test public void rejectsCredentialsAndInsecureSources() {
    assertThrows(Exception.class,()->SourceUrl.normalize("http://example.org/data.json"));
    assertThrows(Exception.class,()->SourceUrl.normalize("https://user:secret@example.org/data.json"));
    assertThrows(Exception.class,()->SourceUrl.normalize("https://github.com/alice/places","../secret.json"));
  }
  @Test public void refreshesAtIntervalBoundaryAndOnCorruptTimestamp() {
    Instant now=Instant.parse("2026-10-27T12:00:00Z");
    assertFalse(RefreshPolicy.isStale("2026-10-27T11:45:00.001Z",now));
    assertTrue(RefreshPolicy.isStale("2026-10-27T11:45:00Z",now));
    assertTrue(RefreshPolicy.isStale("broken",now));
  }
  @Test public void nextRefreshUsesCheckTimeAndBacksOffOnFailure() {
    Instant now=Instant.parse("2026-10-27T12:00:00Z");
    assertEquals(300000, RefreshPolicy.nextDelayMs("2026-10-27T11:50:00Z",now));
    assertEquals(900000, RefreshPolicy.nextDelayMs("2026-10-27T11:45:00Z",now));
    assertEquals(900000, RefreshPolicy.nextDelayMs("broken",now));
    assertEquals(900000, RefreshPolicy.nextDelayMs("2026-10-27T12:01:00Z",now));
  }
}
