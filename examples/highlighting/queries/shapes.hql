// Declarations only: types, a trait, and its implementations. Nothing here is
// evaluated; the file exists to show how the grammar colours a library.

/// Anything with an area.
trait Shape {
    fn area(self) : Decimal
    fn name(self) : String
}

type Circle {
    radius : Decimal
}

type Rect {
    width  : Decimal
    height : Decimal
    label? : String
}

impl Shape for Circle {
    fn area(self) : Decimal = 3.14159 * self.radius * self.radius
    fn name(self) : String = "circle"
}

impl Shape for Rect {
    fn area(self) : Decimal = self.width * self.height
    fn name(self) : String = self.label.unwrap_or("rect")
}

/// The larger of two values of one ordered type.
fn larger<T : Orderable>(a: T, b: T) : T = a given a >= b otherwise b

/// The total area of a list of rectangles.
fn total(shapes: List<Rect>) : Decimal = shapes | map(s => s.area()) | sum

fn describe(shape: Rect, unit: String) : String =
    shape.name() + ", measured in " + unit
