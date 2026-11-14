"""Tests use artificial rows, never exported as observations."""

import unittest
from datetime import date

from fetch_weather import distance_km, monthly_params, normalize


class WeatherTest(unittest.TestCase):
    def test_missing_is_not_dry(self):
        for value in [None, -9.5, -999.9, "", float("nan")]:
            row = normalize({"Precipitation": {"Accumulation": value}}, "2026-03-18")
            self.assertIsNone(row["rainfall_mm"])
            self.assertEqual(row["condition"], "missing")

    def test_trace_is_not_zero(self):
        row = normalize({"Precipitation": {"Accumulation": -9.8}}, "2026-03-18")
        self.assertTrue(row["rainfall_trace"])
        self.assertIsNone(row["rainfall_mm"])
        self.assertEqual(row["condition"], "trace")

    def test_dry_is_not_sunny_and_flags_survive(self):
        row = normalize({"Precipitation": {"Accumulation": 0, "Accumulationf": 2}}, "2026-03-18")
        self.assertEqual(row["condition"], "no_measurable_rain")
        self.assertIsNone(row["official_weather_description"])
        self.assertEqual(row["rainfall_quality_flag"], 2)

    def test_rain_and_month_boundary(self):
        row = normalize({"Precipitation": {"Accumulation": 12.5}}, "2026-03-18")
        self.assertEqual(row["rainfall_mm"], 12.5)
        self.assertEqual(row["condition"], "rain")
        self.assertEqual(
            monthly_params("X", "auto_C0", date(2024, 2, 1))["end"], "2024-02-29T00:00:00"
        )
        self.assertEqual(distance_km(24, 121, 24, 121), 0)


if __name__ == "__main__":
    unittest.main()
