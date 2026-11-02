package com.brightideas.spotlane;

import static org.junit.Assert.*;
import ai.pleos.playground.vehicle.constant.control.VehicleGear;
import org.junit.Test;

public class DrivingStateTest {
  @Test public void locksOnlyOutOfPark() {
    assertFalse(DrivingState.isDriving(VehicleGear.GEAR_PARK));
    assertFalse(DrivingState.isDriving(VehicleGear.GEAR_UNKNOWN));
    assertTrue(DrivingState.isDriving(VehicleGear.GEAR_DRIVE));
    assertTrue(DrivingState.isDriving(VehicleGear.GEAR_REVERSE));
    assertTrue(DrivingState.isDriving(VehicleGear.GEAR_NEUTRAL));
  }
}
