# Budget Drive Protocol (BDP) - Operational Guide

**Status:** Beta Release
**Version:** 1.0.0-beta
**Last Updated:** March 2026

---

## 1. Daily Operations Workflow

### Administrative Dashboard
The Dashboard provides a real-time overview of your driving school's performance, including total lessons, utilization rates, and pending payments.

**Quick Actions:**
- **Add Student:** Register new students with their contact and license details.
- **Schedule Lesson:** Book a new session using the conflict-detection engine.
- **Process Payment:** Log payments and track financial history.

---

## 2. Smart Scheduling Engine

BDP features a **6-Dimensional Conflict Detection** system to ensure error-free booking.

### Conflict Dimensions
1.  **Instructor Busy:** Overlaps with another lesson.
2.  **Vehicle Busy:** Fleet conflict.
3.  **Student Busy:** Overlap in student's schedule.
4.  **Outside Working Hours:** Respects fixed availability windows.
5.  **Time Off:** Blocks dates for vacations or sick days.
6.  **Buffer Violation:** Enforces a minimum 30-minute transition time.

### Recommendation: Use "Smart Booking"
Located under `/scheduling`, this tool automatically suggests green (available) slots based on duration and instructor choice, respecting all 6 dimensions.

---

## 3. Automated Notifications

BDP handles student communication via an automated queue.

### Email Lifecycle
- **Booking Confirmation:** Sent immediately upon scheduling.
- **24-Hour Reminder:** Sent the day before the lesson.
- **1-Hour Reminder:** Final "on my way" alert.

**Setup Note:** Phase 1 uses Gmail SMTP. Ensure your `EMAIL_USER` and `EMAIL_PASSWORD` are correctly configured in the environment settings to enable delivery.

---

## 4. Multi-Tenant Sovereignty

BDP is designed for complete data isolation.
- Each school owns its private records (PostgreSQL).
- User authentication and roles are isolated by `tenant_id`.
- Reports and analytics are school-specific.

---

## 5. Frequently Asked Questions (FAQ)

**Q: Can I share vehicles between instructors?**  
A: Yes. The system checks vehicle availability independently of instructor availability.

**Q: Can I override a conflict?**  
A: Yes, via the "Manual Booking" button on the Lessons page, though the system will issue a warning.

**Q: How do instructors see their schedule?**  
A: Admins can filter the calendar by instructor and print or share the view. Full instructor portals are coming in Phase 2.

---

**For technical architecture, see [ARCHITECTURE.md](ARCHITECTURE.md). For blockchain implementation, see [BLOCKCHAIN.md](BLOCKCHAIN.md).**
