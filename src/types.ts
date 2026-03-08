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
 * Gradebook entry for one course.
 */
export interface GradeEntry {
    /** Course name (e.g. "ENGLISH 11", "Language Arts 4") */
    course: string;
    /** List of term grades for this course */
    grades: PeriodGrade[];
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
