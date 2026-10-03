export const DIMENSION_AXES = [
  "length",
  "mass",
  "time",
  "currency",
  "count",
] as const;

export type DimensionAxis = (typeof DIMENSION_AXES)[number];

/**
 * Exponents make dimensions composable: length² is area and length / length
 * produces the scalar (all-zero) dimension.
 */
export type Dimension = Readonly<Record<DimensionAxis, number>>;

const dimension = (
  values: Partial<Record<DimensionAxis, number>>
): Dimension => ({
  length: 0,
  mass: 0,
  time: 0,
  currency: 0,
  count: 0,
  ...values,
});

export const DIMENSIONS = {
  scalar: dimension({}),
  length: dimension({ length: 1 }),
  area: dimension({ length: 2 }),
  mass: dimension({ mass: 1 }),
  time: dimension({ time: 1 }),
  currency: dimension({ currency: 1 }),
  count: dimension({ count: 1 }),
} as const satisfies Record<string, Dimension>;

export function addDimensionExponents(
  left: Dimension,
  right: Dimension
): Dimension {
  return dimension(
    Object.fromEntries(
      DIMENSION_AXES.map(axis => [axis, left[axis] + right[axis]])
    )
  );
}

export function subtractDimensionExponents(
  left: Dimension,
  right: Dimension
): Dimension {
  return dimension(
    Object.fromEntries(
      DIMENSION_AXES.map(axis => [axis, left[axis] - right[axis]])
    )
  );
}

export function dimensionsEqual(left: Dimension, right: Dimension): boolean {
  return DIMENSION_AXES.every(axis => left[axis] === right[axis]);
}

export function isScalarDimension(value: Dimension): boolean {
  return dimensionsEqual(value, DIMENSIONS.scalar);
}
