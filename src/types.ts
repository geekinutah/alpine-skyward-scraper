/**
 * Represents a student discovered on the Skyward Family Access account.
 */
export interface Student {
    /** Full name as shown in Skyward (e.g. "Jane Doe") */
    name: string;
    /** Internal Skyward student ID, or null if not available */
    id: string | null;
}

/**
 * A single quarter/term grade for a course.
 */
export interface PeriodGrade {
    /** Term label (e.g. "Q1", "Q2", "TERM 1") */
    period: string;
    /** Letter or pass/fail grade (e.g. "A", "B+", "P", "F") */
    grade: string;
}

/**
 * Assignment- or skill-level detail extracted from a grade modal.
 */
export interface AssignmentEntry {
    /** Internal Skyward assignment ID, if available */
    id?: string | null;
    /** Assignment, event, or skill name */
    name: string;
    /** Term/quarter label the entry belongs to (e.g. "Q3", "Current") */
    period?: string | null;
    /** Due date as displayed by Skyward */
    dueDate?: string | null;
    /** Assignment category or standards bucket (e.g. "Assignments", "Quiz") */
    category?: string | null;
    /** Category weight percentage, if shown */
    categoryWeight?: number | null;
    /** Assignment letter mark or rubric value */
    grade?: string | null;
    /** Numeric score percentage, if shown */
    scorePercent?: number | null;
    /** Points earned, if shown */
    pointsEarned?: number | null;
    /** Points possible, if shown */
    pointsPossible?: number | null;
    /** Raw points string as displayed by Skyward */
    pointsText?: string | null;
    /** Whether the item is flagged missing */
    missing?: boolean | null;
    /** Whether the item is excluded from counting */
    noCount?: boolean | null;
    /** Attendance-related status attached to the item */
    absentStatus?: string | null;
    /** Subject/standards area label, common in elementary modals */
    subject?: string | null;
    /** Standards code for elementary skill rows */
    skillCode?: string | null;
    /** Standards description for elementary skill rows */
    skillDescription?: string | null;
    /** Whether this row represents a skill/standard rather than a classic assignment */
    isSkill?: boolean;
    /** Whether Skyward marks the subject as graded */
    isGradedSubject?: boolean | null;
}

/**
 * Gradebook entry for one course.
 */
export interface GradeEntry {
    /** Course name (e.g. "ENGLISH 11", "Language Arts 4") */
    course: string;
    /** List of term grades for this course */
    grades: PeriodGrade[];
    /** Assignment, event, or skill details gathered from the grade modal */
    assignmentEntries?: AssignmentEntry[];
}

/**
 * A single class period from the student's schedule.
 */
export interface ScheduleEntry {
    /** Course name */
    course: string;
    /** Teacher's name */
    teacher: string;
    /** Period label (e.g. "Period 1", "1") */
    period: string;
    /** Time range (e.g. "9:15 AM - 10:35 AM"), if available */
    time?: string;
    /** Term this entry applies to (e.g. "Term 1", "Q3") */
    term: string;
    /** Room number, if available */
    room?: string;
}

/**
 * Result returned by `getSchedule()`.
 * Contains all schedule entries and the currently active term label.
 */
export interface ScheduleResult {
    /** All schedule entries across all terms */
    schedule: ScheduleEntry[];
    /** The currently active term label (e.g. "Term 3"), or null if not detectable */
    activeTerm: string | null;
}

/**
 * A single attendance event.
 */
export interface AttendanceEntry {
    /** Date of the event (e.g. "2026-02-14") */
    date: string;
    /** Attendance type (e.g. "Excused", "Unexcused", "Tardy") */
    type: string;
    /** Period or block (e.g. "Period 3") */
    period: string;
    /** Associated course name */
    course: string;
}
