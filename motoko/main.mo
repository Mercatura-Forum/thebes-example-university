import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import Array "mo:core/Array";
import Runtime "mo:core/Runtime";
import Admin "mo:thebes-lib/Admin";

// University course registration. The registrar (Admin owner/admins) publishes
// courses and opens/closes registration; students enroll while it's open. Every
// guard/auth failure is a `Runtime.trap` (→ rollback), so the SPA gets a clean
// success value or a typed error — no Result to decode.
//
// Correctness guards (the real ones):
//   1. SEAT CAPACITY — an enrollment that would exceed a course's capacity is
//      rejected. The full-check and the seat increment happen in ONE synchronous
//      call (no await between), so two concurrent students can't both take the
//      last seat (the registration analogue of the double-booking guard).
//   2. NO DOUBLE-ENROLL — a student already in a course can't enroll again.
//   3. REGISTRATION WINDOW — enroll/drop only while the registrar has it open.
persistent actor University {

  var admin = Admin.init();

  public shared(msg) func claimOwner() : async Bool {
    if (Principal.isAnonymous(msg.caller)) Runtime.trap("anonymous caller");
    Admin.claimOwner(admin, msg.caller)
  };
  public shared(msg) func transferOwner(n : Principal) : async Bool { Admin.transferOwner(admin, msg.caller, n) };
  public shared(msg) func addAdmin(w : Principal) : async Bool { Admin.addAdmin(admin, msg.caller, w) };
  public shared(msg) func setPaused(v : Bool) : async Bool { Admin.setPaused(admin, msg.caller, v) };
  public query func getOwner() : async ?Principal { Admin.getOwner(admin) };
  public query func isPaused() : async Bool { Admin.isPaused(admin) };

  type Course = { id : Nat; code : Text; title : Text; capacity : Nat; enrolled : Nat; instructor : Text; photoPath : ?Text };

  var nextCourseId : Nat = 0;
  var registrationOpen : Bool = true;
  let courses = Map.empty<Nat, Course>();
  // student -> the course ids they're enrolled in (the source of truth for
  // no-double-enroll and "my courses").
  let studentCourses = Map.empty<Principal, [Nat]>();

  // Registrar: open/close the registration window.
  public shared(msg) func setRegistrationOpen(open : Bool) : async () {
    Admin.requireAdmin(admin, msg.caller);
    registrationOpen := open;
  };
  public query func isRegistrationOpen() : async Bool { registrationOpen };

  // No-auth core: publish a course. Shared by the registrar-gated public method
  // and by seedDemo (which bypasses the gate only on an empty just-deployed catalog).
  func addCourseRaw(code : Text, title : Text, capacity : Nat, instructor : Text, photoPath : ?Text) : Nat {
    if (capacity == 0) Runtime.trap("capacity must be > 0");
    let id = nextCourseId;
    nextCourseId += 1;
    Map.add(courses, Nat.compare, id, { id; code; title; capacity; enrolled = 0; instructor; photoPath });
    id;
  };

  // Registrar: publish a course. Returns its id.
  public shared(msg) func addCourse(code : Text, title : Text, capacity : Nat, instructor : Text, photoPath : ?Text) : async Nat {
    Admin.requireNotPaused(admin);
    Admin.requireAdmin(admin, msg.caller);
    addCourseRaw(code, title, capacity, instructor, photoPath);
  };

  // Seed a demo catalog so a just-deployed registrar is alive. Global content:
  // fires only when the catalog is empty (bypasses the registrar gate so the
  // first signed-in visitor brings it to life).
  public shared(msg) func seedDemo() : async Bool {
    Admin.requireNotPaused(admin);
    if (Principal.isAnonymous(msg.caller)) Runtime.trap("Sign in to load demo data");
    if (Map.size(courses) > 0) return false;
    ignore addCourseRaw("CS 101", "Introduction to Computer Science", 120, "Dr. Salma Haddad", null);
    ignore addCourseRaw("MATH 210", "Linear Algebra", 80, "Prof. Idris Khan", null);
    ignore addCourseRaw("PHYS 150", "Classical Mechanics", 60, "Dr. Nadia Osei", null);
    ignore addCourseRaw("ECON 110", "Principles of Microeconomics", 100, "Prof. Marco Bianchi", null);
    ignore addCourseRaw("BIO 130", "Cell Biology", 45, "Dr. Hana Tanaka", null);
    true;
  };

  public shared(msg) func setCoursePhoto(courseId : Nat, photoPath : Text) : async () {
    Admin.requireNotPaused(admin);
    Admin.requireAdmin(admin, msg.caller);
    switch (Map.get(courses, Nat.compare, courseId)) {
      case null { Runtime.trap("course not found") };
      case (?c) { Map.add(courses, Nat.compare, courseId, { c with photoPath = ?photoPath }) };
    };
  };

  func myCourseIds(student : Principal) : [Nat] {
    switch (Map.get(studentCourses, Principal.compare, student)) { case (?ids) ids; case null { [] } };
  };
  func isEnrolled(student : Principal, courseId : Nat) : Bool {
    switch (Array.find<Nat>(myCourseIds(student), func(id) { id == courseId })) { case (?_) true; case null false };
  };

  // Student: enroll. GUARDS — registration must be open, not already enrolled,
  // and a seat must be free; the full-check + seat increment are atomic.
  public shared(msg) func enroll(courseId : Nat) : async () {
    Admin.requireNotPaused(admin);
    if (not registrationOpen) Runtime.trap("registration is closed");
    if (Principal.isAnonymous(msg.caller)) Runtime.trap("anonymous caller");
    let course = switch (Map.get(courses, Nat.compare, courseId)) { case (?c) c; case null { Runtime.trap("course not found") } };
    if (isEnrolled(msg.caller, courseId)) Runtime.trap("already enrolled");
    if (course.enrolled >= course.capacity) Runtime.trap("course is full");
    // Atomic: take the seat and record the enrollment in the same call.
    Map.add(courses, Nat.compare, courseId, { course with enrolled = course.enrolled + 1 });
    Map.add(studentCourses, Principal.compare, msg.caller, Array.concat(myCourseIds(msg.caller), [courseId]));
  };

  // Student: drop a course (frees the seat) while registration is open.
  public shared(msg) func drop(courseId : Nat) : async () {
    Admin.requireNotPaused(admin);
    if (not registrationOpen) Runtime.trap("registration is closed");
    if (not isEnrolled(msg.caller, courseId)) Runtime.trap("not enrolled");
    switch (Map.get(courses, Nat.compare, courseId)) {
      case (?c) { if (c.enrolled > 0) Map.add(courses, Nat.compare, courseId, { c with enrolled = c.enrolled - 1 }) };
      case null {};
    };
    let kept = Array.filter<Nat>(myCourseIds(msg.caller), func(id) { id != courseId });
    Map.add(studentCourses, Principal.compare, msg.caller, kept);
  };

  // ── Frontend views (flat) ──
  public query func coursesView() : async [{ id : Nat; code : Text; title : Text; capacity : Nat; enrolled : Nat; seatsLeft : Nat; instructor : Text; photoPath : Text }] {
    Array.map<(Nat, Course), { id : Nat; code : Text; title : Text; capacity : Nat; enrolled : Nat; seatsLeft : Nat; instructor : Text; photoPath : Text }>(
      Map.toArray<Nat, Course>(courses),
      func((_, c)) { { id = c.id; code = c.code; title = c.title; capacity = c.capacity; enrolled = c.enrolled; seatsLeft = (if (c.capacity > c.enrolled) c.capacity - c.enrolled else 0); instructor = c.instructor; photoPath = (switch (c.photoPath) { case (?p) p; case null "" }) } },
    )
  };

  // The caller's enrolled courses (joined with course details).
  public shared query(msg) func myCoursesView() : async [{ id : Nat; code : Text; title : Text; instructor : Text; photoPath : Text }] {
    Array.map<Nat, { id : Nat; code : Text; title : Text; instructor : Text; photoPath : Text }>(
      myCourseIds(msg.caller),
      func(id) {
        switch (Map.get(courses, Nat.compare, id)) {
          case (?c) { { id = c.id; code = c.code; title = c.title; instructor = c.instructor; photoPath = (switch (c.photoPath) { case (?p) p; case null "" }) } };
          case null { { id; code = "?"; title = "(removed)"; instructor = ""; photoPath = "" } };
        }
      },
    )
  };
}
