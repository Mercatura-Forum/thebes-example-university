import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Array "mo:core/Array";
import List "mo:core/List";
import Runtime "mo:core/Runtime";
import Admin "mo:thebes-lib/Admin";

// University registrar — courses, seats, prerequisites, transcripts.
//
// The property this example proves: **a registration that cannot contradict
// itself.** A seat never oversells (the full-check and the seat increment
// share one synchronous call); a student never double-enrolls, never exceeds
// the credit load, and never enters a course whose prerequisites they have
// not completed; a full course takes a waitlist that promotes strictly
// first-come-first-eligible when a seat frees; grades are recorded once by
// the registrar and the transcript is append-only — GPA is computed on-chain
// from it. The public oracle `invariantReportView` re-proves five laws over
// the whole university on every read.
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

  type Course = {
    id : Nat; code : Text; title : Text; credits : Nat;
    capacity : Nat; enrolled : Nat; instructor : Text;
    prereqs : [Nat]; photoPath : ?Text;
  };
  // One transcript line: gradeX100 on the 4.00 scale ×100 (A=400 … F=0).
  // A grade ≥ 100 (D or better) completes the course for prerequisite purposes.
  type TranscriptLine = { courseId : Nat; gradeX100 : Nat; at : Int };

  let MAX_LOAD : Nat = 18; // credits a student may carry at once

  var nextCourseId : Nat = 0;
  var registrationOpen : Bool = true;
  let courses = Map.empty<Nat, Course>();
  let studentCourses = Map.empty<Principal, [Nat]>();   // current enrollments
  let waitlists = Map.empty<Nat, [Principal]>();        // course id → FIFO queue
  let transcripts = Map.empty<Principal, List.List<TranscriptLine>>(); // append-only

  // Registrar: open/close the registration window.
  public shared(msg) func setRegistrationOpen(open : Bool) : async () {
    Admin.requireAdmin(admin, msg.caller);
    registrationOpen := open;
  };
  public query func isRegistrationOpen() : async Bool { registrationOpen };

  func enrolledIds(p : Principal) : [Nat] {
    switch (Map.get(studentCourses, Principal.compare, p)) { case (?ids) ids; case null [] };
  };
  func transcriptOf(p : Principal) : List.List<TranscriptLine> {
    switch (Map.get(transcripts, Principal.compare, p)) {
      case (?l) l;
      case null { let l = List.empty<TranscriptLine>(); Map.add(transcripts, Principal.compare, p, l); l };
    };
  };
  // Completed = any transcript line for the course with a passing grade (≥ D).
  func hasCompleted(p : Principal, courseId : Nat) : Bool {
    for (t in List.values(transcriptOf(p))) {
      if (t.courseId == courseId and t.gradeX100 >= 100) return true;
    };
    false;
  };
  func creditLoad(p : Principal) : Nat {
    var load : Nat = 0;
    for (id in enrolledIds(p).values()) {
      switch (Map.get(courses, Nat.compare, id)) { case (?c) load += c.credits; case null {} };
    };
    load;
  };
  func courseOf(id : Nat) : Course {
    switch (Map.get(courses, Nat.compare, id)) { case (?c) c; case null Runtime.trap("course not found") };
  };

  func addCourseRaw(code : Text, title : Text, credits : Nat, capacity : Nat, instructor : Text, prereqs : [Nat], photoPath : ?Text) : Nat {
    if (capacity == 0) Runtime.trap("capacity must be > 0");
    if (credits == 0) Runtime.trap("credits must be > 0");
    for (pr in prereqs.values()) {
      if (Map.get(courses, Nat.compare, pr) == null) Runtime.trap("prerequisite course not found");
    };
    let id = nextCourseId;
    nextCourseId += 1;
    Map.add(courses, Nat.compare, id, { id; code; title; credits; capacity; enrolled = 0; instructor; prereqs; photoPath });
    id;
  };

  // Registrar: publish a course (prereqs must already exist, so the catalog is
  // a DAG by construction — a course can never require itself or the future).
  public shared(msg) func addCourse(code : Text, title : Text, credits : Nat, capacity : Nat, instructor : Text, prereqs : [Nat], photoPath : ?Text) : async Nat {
    Admin.requireNotPaused(admin);
    Admin.requireAdmin(admin, msg.caller);
    addCourseRaw(code, title, credits, capacity, instructor, prereqs, photoPath);
  };

  public shared(msg) func setCoursePhoto(courseId : Nat, photoPath : Text) : async () {
    Admin.requireNotPaused(admin);
    Admin.requireAdmin(admin, msg.caller);
    let c = courseOf(courseId);
    Map.add(courses, Nat.compare, courseId, { c with photoPath = ?photoPath });
  };

  // The eligibility gauntlet, shared by enroll and waitlist promotion.
  // Returns null when eligible, else the reason.
  func ineligible(p : Principal, c : Course) : ?Text {
    if (Array.find<Nat>(enrolledIds(p), func(id) { id == c.id }) != null) return ?"already enrolled";
    if (hasCompleted(p, c.id)) return ?"already completed";
    for (pr in c.prereqs.values()) {
      if (not hasCompleted(p, pr)) return ?("missing prerequisite " # courseOf(pr).code);
    };
    if (creditLoad(p) + c.credits > MAX_LOAD) return ?("over the credit load (max " # Nat.toText(MAX_LOAD) # ")");
    null;
  };

  func seat(p : Principal, courseId : Nat) {
    let c = courseOf(courseId);
    Map.add(courses, Nat.compare, courseId, { c with enrolled = c.enrolled + 1 });
    Map.add(studentCourses, Principal.compare, p, Array.concat(enrolledIds(p), [courseId]));
  };

  // Student: take a seat. Every guard and the seat increment share this one
  // synchronous call — two concurrent students cannot both take the last seat.
  public shared(msg) func enroll(courseId : Nat) : async () {
    Admin.requireNotPaused(admin);
    if (Principal.isAnonymous(msg.caller)) Runtime.trap("Sign in first");
    if (not registrationOpen) Runtime.trap("registration is closed");
    let c = courseOf(courseId);
    switch (ineligible(msg.caller, c)) { case (?why) Runtime.trap(why); case null {} };
    if (c.enrolled >= c.capacity) Runtime.trap("course is full — join the waitlist");
    seat(msg.caller, courseId);
  };

  // Student: queue for a full course. FIFO; promotion happens the moment a
  // seat frees (drop or grade), strictly first-come-first-ELIGIBLE.
  public shared(msg) func joinWaitlist(courseId : Nat) : async Nat {
    Admin.requireNotPaused(admin);
    if (Principal.isAnonymous(msg.caller)) Runtime.trap("Sign in first");
    if (not registrationOpen) Runtime.trap("registration is closed");
    let c = courseOf(courseId);
    if (c.enrolled < c.capacity) Runtime.trap("seats are free — enroll instead of waiting");
    switch (ineligible(msg.caller, c)) { case (?why) Runtime.trap(why); case null {} };
    let q = switch (Map.get(waitlists, Nat.compare, courseId)) { case (?q) q; case null [] };
    for (w in q.values()) { if (Principal.equal(w, msg.caller)) Runtime.trap("already on this waitlist") };
    Map.add(waitlists, Nat.compare, courseId, Array.concat(q, [msg.caller]));
    q.size() + 1;
  };

  public shared(msg) func leaveWaitlist(courseId : Nat) : async () {
    let q = switch (Map.get(waitlists, Nat.compare, courseId)) { case (?q) q; case null Runtime.trap("not on this waitlist") };
    let filtered = Array.filter<Principal>(q, func(w) { not Principal.equal(w, msg.caller) });
    if (filtered.size() == q.size()) Runtime.trap("not on this waitlist");
    Map.add(waitlists, Nat.compare, courseId, filtered);
  };

  // A seat freed: hand it to the first STILL-ELIGIBLE waiter; ineligible heads
  // fall off the queue (their state changed since they queued — visible to
  // them as no longer being waitlisted).
  func promote(courseId : Nat) {
    var q = switch (Map.get(waitlists, Nat.compare, courseId)) { case (?q) q; case null [] };
    label sweep while (q.size() > 0) {
      let head = q[0];
      q := Array.sliceToArray<Principal>(q, 1, q.size());
      let c = courseOf(courseId);
      if (c.enrolled >= c.capacity) { break sweep };
      if (ineligible(head, c) == null) {
        seat(head, courseId);
        break sweep;
      };
    };
    Map.add(waitlists, Nat.compare, courseId, q);
  };

  public shared(msg) func drop(courseId : Nat) : async () {
    Admin.requireNotPaused(admin);
    if (not registrationOpen) Runtime.trap("registration is closed");
    let mine = enrolledIds(msg.caller);
    let filtered = Array.filter<Nat>(mine, func(id) { id != courseId });
    if (filtered.size() == mine.size()) Runtime.trap("not enrolled in this course");
    Map.add(studentCourses, Principal.compare, msg.caller, filtered);
    let c = courseOf(courseId);
    Map.add(courses, Nat.compare, courseId, { c with enrolled = (if (c.enrolled > 0) c.enrolled - 1 else 0) });
    promote(courseId);
  };

  // Registrar: record a grade. The enrollment closes (the seat frees, the
  // waitlist promotes) and the line lands on the APPEND-ONLY transcript —
  // recorded once, never edited. gradeX100: A=400 B=300 C=200 D=100 F=0.
  public shared(msg) func recordGrade(student : Principal, courseId : Nat, gradeX100 : Nat) : async () {
    Admin.requireNotPaused(admin);
    Admin.requireAdmin(admin, msg.caller);
    if (gradeX100 > 400) Runtime.trap("grades run 0 (F) to 400 (A)");
    let mine = enrolledIds(student);
    let filtered = Array.filter<Nat>(mine, func(id) { id != courseId });
    if (filtered.size() == mine.size()) Runtime.trap("that student is not enrolled in this course");
    Map.add(studentCourses, Principal.compare, student, filtered);
    let c = courseOf(courseId);
    Map.add(courses, Nat.compare, courseId, { c with enrolled = (if (c.enrolled > 0) c.enrolled - 1 else 0) });
    List.add(transcriptOf(student), { courseId; gradeX100; at = Time.now() });
    promote(courseId);
  };

  // Registrar: transfer credit — a transcript line without an enrollment
  // (credit earned elsewhere). Refused if the course is already completed.
  public shared(msg) func transferCredit(student : Principal, courseId : Nat, gradeX100 : Nat) : async () {
    Admin.requireNotPaused(admin);
    Admin.requireAdmin(admin, msg.caller);
    if (gradeX100 > 400) Runtime.trap("grades run 0 (F) to 400 (A)");
    ignore courseOf(courseId);
    if (hasCompleted(student, courseId)) Runtime.trap("already completed");
    List.add(transcriptOf(student), { courseId; gradeX100; at = Time.now() });
  };

  // Seed a small catalog with a real prerequisite DAG (global, if empty) and
  // give the caller a transcript + an enrollment (per-caller, if brand-new),
  // so the constellation lights up on first load.
  public shared(msg) func seedDemo() : async Bool {
    Admin.requireNotPaused(admin);
    if (Principal.isAnonymous(msg.caller)) Runtime.trap("Sign in to load demo data");
    var changed = false;
    if (Map.size(courses) == 0) {
      let math101 = addCourseRaw("MATH101", "Calculus I", 4, 30, "Dr. Farouk", [], null);
      let cs101 = addCourseRaw("CS101", "Programs & Proofs", 4, 25, "Dr. Okafor", [], null);
      let cs201 = addCourseRaw("CS201", "Data Structures", 4, 20, "Dr. Vasquez", [cs101], null);
      ignore addCourseRaw("CS301", "Distributed Systems", 4, 15, "Dr. Hanke", [cs201, math101], null);
      ignore addCourseRaw("PHY102", "Mechanics", 4, 25, "Dr. Aziz", [math101], null);
      ignore addCourseRaw("ART110", "Drawing Studio", 2, 2, "M. Delacroix", [], null);
      changed := true;
    };
    if (List.size(transcriptOf(msg.caller)) == 0 and enrolledIds(msg.caller).size() == 0) {
      // Transfer credit for the two foundations, then a live enrollment.
      List.add(transcriptOf(msg.caller), { courseId = 1; gradeX100 = 400; at = Time.now() }); // CS101 · A
      List.add(transcriptOf(msg.caller), { courseId = 0; gradeX100 = 300; at = Time.now() }); // MATH101 · B
      let cs201 = courseOf(2);
      if (cs201.enrolled < cs201.capacity) { seat(msg.caller, 2) };
      changed := true;
    };
    changed;
  };

  // ── The oracle: five laws over the whole university, recomputable by anyone ──
  public query func invariantReportView() : async [{ rule : Text; detail : Text }] {
    let bad = List.empty<{ rule : Text; detail : Text }>();
    // Recompute per-course enrollment from the student index.
    let perCourse = Map.empty<Nat, Nat>();
    for ((p, ids) in Map.entries(studentCourses)) {
      // R2 no-double: a student's list carries no duplicates.
      var i = 0;
      while (i < ids.size()) {
        var j = i + 1;
        while (j < ids.size()) {
          if (ids[i] == ids[j]) List.add(bad, { rule = "R2 double"; detail = "a student is enrolled twice in course #" # Nat.toText(ids[i]) });
          j += 1;
        };
        i += 1;
      };
      var load : Nat = 0;
      for (id in ids.values()) {
        let prev = switch (Map.get(perCourse, Nat.compare, id)) { case (?n) n; case null 0 };
        Map.add(perCourse, Nat.compare, id, prev + 1);
        switch (Map.get(courses, Nat.compare, id)) {
          case (?c) {
            load += c.credits;
            // R5 prereqs: every current enrollment's prerequisites are completed.
            for (pr in c.prereqs.values()) {
              if (not hasCompleted(p, pr)) {
                List.add(bad, { rule = "R5 prereq"; detail = "an enrollment in " # c.code # " lacks a completed prerequisite" });
              };
            };
          };
          case null List.add(bad, { rule = "R1 seats"; detail = "an enrollment points at a missing course" });
        };
      };
      // R3 load: nobody carries more than the maximum.
      if (load > MAX_LOAD) List.add(bad, { rule = "R3 load"; detail = "a student carries " # Nat.toText(load) # " credits (max " # Nat.toText(MAX_LOAD) # ")" });
    };
    for ((id, c) in Map.entries(courses)) {
      let n = switch (Map.get(perCourse, Nat.compare, id)) { case (?n) n; case null 0 };
      // R1 seats: the counter equals the recomputed roll, and never over capacity.
      if (n != c.enrolled) List.add(bad, { rule = "R1 seats"; detail = c.code # " counter says " # Nat.toText(c.enrolled) # " but the roll counts " # Nat.toText(n) });
      if (c.enrolled > c.capacity) List.add(bad, { rule = "R1 seats"; detail = c.code # " is enrolled beyond capacity" });
      // R4 waitlist: nobody waits while seats are free.
      switch (Map.get(waitlists, Nat.compare, id)) {
        case (?q) {
          if (q.size() > 0 and c.enrolled < c.capacity) {
            List.add(bad, { rule = "R4 waitlist"; detail = c.code # " has free seats while " # Nat.toText(q.size()) # " wait" });
          };
        };
        case null {};
      };
    };
    List.toArray(bad);
  };

  // One public row for the footer seal.
  public query func universitySealView() : async [{
    courses : Nat; seatsFilled : Nat; seatsTotal : Nat; students : Nat;
    waitlisted : Nat; transcriptLines : Nat; violations : Nat; checkedAt : Int;
  }] {
    var filled : Nat = 0; var total : Nat = 0;
    for ((_, c) in Map.entries(courses)) { filled += c.enrolled; total += c.capacity };
    var wl : Nat = 0;
    for ((_, q) in Map.entries(waitlists)) { wl += q.size() };
    var lines : Nat = 0; var students : Nat = 0;
    for ((_, t) in Map.entries(transcripts)) { lines += List.size(t); if (List.size(t) > 0) students += 1 };
    for ((p, ids) in Map.entries(studentCourses)) {
      if (ids.size() > 0 and List.size(transcriptOf(p)) == 0) students += 1;
    };
    // Cheap violation count: recompute the seat law only (the full report is public).
    let perCourse = Map.empty<Nat, Nat>();
    for ((_, ids) in Map.entries(studentCourses)) {
      for (id in ids.values()) {
        let prev = switch (Map.get(perCourse, Nat.compare, id)) { case (?n) n; case null 0 };
        Map.add(perCourse, Nat.compare, id, prev + 1);
      };
    };
    var v : Nat = 0;
    for ((id, c) in Map.entries(courses)) {
      let n = switch (Map.get(perCourse, Nat.compare, id)) { case (?n) n; case null 0 };
      if (n != c.enrolled or c.enrolled > c.capacity) v += 1;
    };
    [{ courses = Map.size(courses); seatsFilled = filled; seatsTotal = total; students; waitlisted = wl; transcriptLines = lines; violations = v; checkedAt = Time.now() }];
  };

  // ── Frontend views (flat) ──

  // The whole catalog with the caller's state per course — the constellation
  // draws straight from this. prereqIds are "|"-joined (flat-decoder friendly).
  public shared query(msg) func catalogView() : async [{
    id : Nat; code : Text; title : Text; credits : Nat; capacity : Nat; enrolled : Nat;
    instructor : Text; photoPath : Text; prereqIds : Text; waitlistLen : Nat;
    myState : Text; // "completed" | "enrolled" | "waitlisted" | "open" | "locked" | "full"
    lockReason : Text; nowNs : Int;
  }] {
    let now = Time.now();
    let mine = enrolledIds(msg.caller);
    Array.map<(Nat, Course), { id : Nat; code : Text; title : Text; credits : Nat; capacity : Nat; enrolled : Nat; instructor : Text; photoPath : Text; prereqIds : Text; waitlistLen : Nat; myState : Text; lockReason : Text; nowNs : Int }>(
      Map.toArray(courses),
      func((id, c)) {
        var pr = "";
        for (p in c.prereqs.values()) { if (pr != "") pr #= "|"; pr #= Nat.toText(p) };
        let q = switch (Map.get(waitlists, Nat.compare, id)) { case (?q) q; case null [] };
        var onList = false;
        for (w in q.values()) { if (Principal.equal(w, msg.caller)) onList := true };
        let enrolledHere = Array.find<Nat>(mine, func(x) { x == id }) != null;
        var state = "open";
        var reason = "";
        if (hasCompleted(msg.caller, id)) { state := "completed" }
        else if (enrolledHere) { state := "enrolled" }
        else if (onList) { state := "waitlisted" }
        else {
          switch (ineligible(msg.caller, c)) {
            case (?why) { state := "locked"; reason := why };
            case null { if (c.enrolled >= c.capacity) state := "full" };
          };
        };
        {
          id = c.id; code = c.code; title = c.title; credits = c.credits;
          capacity = c.capacity; enrolled = c.enrolled; instructor = c.instructor;
          photoPath = (switch (c.photoPath) { case (?p) p; case null "" });
          prereqIds = pr; waitlistLen = q.size(); myState = state; lockReason = reason; nowNs = now;
        };
      },
    );
  };

  // The caller's standing: load, GPA (×100, credit-weighted over completed
  // lines), and counts. GPA is computed on-chain from the transcript.
  public shared query(msg) func myStandingView() : async [{
    creditsInProgress : Nat; creditsCompleted : Nat; gpaX100 : Nat;
    enrolledCount : Nat; transcriptCount : Nat; maxLoad : Nat; nowNs : Int;
  }] {
    var points : Nat = 0; var credDone : Nat = 0;
    for (t in List.values(transcriptOf(msg.caller))) {
      switch (Map.get(courses, Nat.compare, t.courseId)) {
        case (?c) { points += t.gradeX100 * c.credits; credDone += c.credits };
        case null {};
      };
    };
    [{
      creditsInProgress = creditLoad(msg.caller);
      creditsCompleted = credDone;
      gpaX100 = if (credDone == 0) 0 else points / credDone;
      enrolledCount = enrolledIds(msg.caller).size();
      transcriptCount = List.size(transcriptOf(msg.caller));
      maxLoad = MAX_LOAD; nowNs = Time.now();
    }];
  };

  public shared query(msg) func myTranscriptView() : async [{
    courseId : Nat; code : Text; title : Text; credits : Nat; gradeX100 : Nat; at : Int;
  }] {
    Array.map<TranscriptLine, { courseId : Nat; code : Text; title : Text; credits : Nat; gradeX100 : Nat; at : Int }>(
      List.toArray(transcriptOf(msg.caller)),
      func(t) {
        let (code, title, credits) = switch (Map.get(courses, Nat.compare, t.courseId)) {
          case (?c) (c.code, c.title, c.credits); case null ("?", "(removed)", 0);
        };
        { courseId = t.courseId; code; title; credits; gradeX100 = t.gradeX100; at = t.at };
      },
    );
  };

  // Registrar: the roll for one course (names are principals — hex on the SPA).
  public shared query(msg) func rollView(courseId : Nat) : async [{ student : Principal; load : Nat }] {
    if (not Admin.isAdmin(admin, msg.caller)) return [];
    let out = List.empty<{ student : Principal; load : Nat }>();
    for ((p, ids) in Map.entries(studentCourses)) {
      if (Array.find<Nat>(ids, func(x) { x == courseId }) != null) {
        List.add(out, { student = p; load = creditLoad(p) });
      };
    };
    List.toArray(out);
  };
}
