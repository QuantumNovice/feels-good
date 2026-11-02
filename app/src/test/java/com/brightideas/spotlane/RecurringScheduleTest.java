package com.brightideas.spotlane;

import static org.junit.Assert.*;
import java.time.Instant;
import org.json.*;
import org.junit.Test;

public class RecurringScheduleTest {
  private JSONObject schedule() throws Exception {
    return new JSONObject("{\"timezone\":\"Asia/Seoul\",\"rules\":[{\"months\":[10],\"weekdays\":[6],\"times\":[\"19:00\"],\"durationMinutes\":12}],\"validThrough\":\"2026-10-31\"}");
  }
  @Test public void retainsUpcomingButHonorsExclusiveFinalEnd() throws Exception {
    JSONObject s = schedule();
    RecurringSchedule.validate(s);
    assertTrue(RecurringSchedule.available(s,Instant.parse("2026-10-31T10:11:59Z")));
    assertFalse(RecurringSchedule.available(s,Instant.parse("2026-10-31T10:12:00Z")));
    s.put("excludedDates",new JSONArray().put("2026-10-31"));
    assertFalse(RecurringSchedule.available(s,Instant.parse("2026-10-30T00:00:00Z")));
  }
  @Test public void rejectsMalformedOrEmptySchedules() throws Exception {
    JSONObject s = schedule();
    s.getJSONArray("rules").getJSONObject(0).put("times",new JSONArray().put("25:00"));
    assertThrows(Exception.class,()->RecurringSchedule.validate(s));
    assertThrows(Exception.class,()->RecurringSchedule.validate(new JSONObject().put("timezone","Asia/Seoul").put("rules",new JSONArray())));
  }
  @Test public void eventAcceptsRecurrenceWhilePopupStillNeedsExpiry() throws Exception {
    JSONObject p = new JSONObject().put("id","show").put("name","Show").put("source","Official source").put("latitude",35.15).put("longitude",129.12).put("category","event").put("recurrence",schedule());
    assertEquals(1,Dataset.validate(new JSONArray().put(p).toString()).length());
    p.put("category","popup");
    assertThrows(Exception.class,()->Dataset.validate(new JSONArray().put(p).toString()));
  }
}
