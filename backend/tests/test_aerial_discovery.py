from math import isclose

from app.area import aerial_candidate_locations
from app.models import AerialTreeDetection, AerialTreeDetections, AreaBounds
from app.vision import strict_schema


def detection(x: float, y: float, confidence: float = 0.9) -> AerialTreeDetection:
    return AerialTreeDetection(x_ratio=x, y_ratio=y, confidence=confidence, evidence="Distinct circular canopy.")


def test_aerial_ratios_map_to_geographic_coordinates():
    bounds = AreaBounds(south=44.66, west=-63.61, north=44.68, east=-63.59)
    locations = aerial_candidate_locations([detection(0.25, 0.75)], [-63.61, 44.66, -63.59, 44.68], bounds, [])

    assert len(locations) == 1
    assert isclose(locations[0][0], 44.665)
    assert isclose(locations[0][1], -63.605)


def test_aerial_candidates_are_filtered_by_confidence_and_inventory_distance():
    bounds = AreaBounds(south=44.66, west=-63.61, north=44.68, east=-63.59)
    inventory = [(44.67, -63.60, "TREE-1", None, None)]
    locations = aerial_candidate_locations(
        [detection(0.5, 0.5), detection(0.75, 0.25, confidence=0.5), detection(0.8, 0.2)],
        [-63.61, 44.66, -63.59, 44.68], bounds, inventory,
    )

    assert len(locations) == 1
    assert isclose(locations[0][1], -63.594)


def test_aerial_discovery_schema_is_strict_for_nested_detections():
    schema = strict_schema(AerialTreeDetections)
    detection_schema = schema["$defs"]["AerialTreeDetection"]

    assert schema["required"] == ["detections"]
    assert set(detection_schema["required"]) == {"x_ratio", "y_ratio", "confidence", "evidence"}
    assert detection_schema["additionalProperties"] is False
