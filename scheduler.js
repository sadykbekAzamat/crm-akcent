// 📅 ATTENDANCE API FUNCTIONS
// Константы
const VALID_STATUSES = ["present", "absent", "late", "excused", null];

const TZ = "Asia/Almaty";

// Единая функция для всего проекта
const getAlmatyNow = () => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  return new Date(
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+05:00`
  );
};

// Для временных меток
const getAlmatyTimestamp = () => getAlmatyNow().getTime();

const getAlmatyTime = (date = null) => {
  if (!date) return getAlmatyNow();
  // Конвертируем переданную дату в Almaty время
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value])
  );
  return new Date(
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+05:00`
  );
};
// Проверка админских прав (если нужно)
const verifyAdminAccess = async (req) => {
  // TODO: Реализовать проверку админского токена если нужно
  // const token = req.headers.authorization;
  // const decodedToken = await admin.auth().verifyIdToken(token);
  // return decodedToken.role === 'admin';
  return true; // Пока разрешаем все, так как только админ использует
};

// Создание базовой структуры monthly record
const createEmptyMonthlyRecord = async (teacherId, year, month) => {
  const actualStudents = await getStudentsByTeacher(teacherId);
  const daysInMonth = new Date(year, month, 0).getDate();
  const now = getAlmatyNow();

  const students = actualStudents.map((student) => ({
    studentId: student.id,
    studentName: student.fullName,
    attendance: {},
    groupId: student.groupId,
    groupName: student.groupInfo?.name || "",
    groupInfo: student.groupInfo || null,
    activityPeriod: {
      startDate: now.toISOString(),
      startYear: now.getFullYear(),
      startMonth: now.getMonth() + 1,
      startDay: now.getDate(),
      endDate: null,
      endYear: null,
      endMonth: null,
      endDay: null,
    },
    availableDays: Array.from({ length: daysInMonth }, (_, i) => i + 1),
  }));

  return {
    teacherId,
    year: parseInt(year),
    month: parseInt(month),
    students,
    metadata: {
      totalStudents: students.length,
      createdAt: getAlmatyTimestamp(),
      updatedAt: getAlmatyTimestamp(),

      schemaVersion: 1,
    },
    daysInMonth,
    recordExists: false,
    withActivityPeriods: true,
  };
};

exports.getMonthlyAttendance = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      const { teacherId, year, month } = req.query;

      if (!teacherId || !year || !month) {
        return res
          .status(400)
          .json({ error: "teacherId, year, and month are required" });
      }

      const yearNum = parseInt(year);
      const monthNum = parseInt(month);
      if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ error: "Invalid year or month format" });
      }

      // Проверка админских прав (опционально)
      const hasAccess = await verifyAdminAccess(req);
      if (!hasAccess) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const recordId = `${teacherId}_${year}_${month}`;
      const recordRef = db.ref(`monthly_records/${recordId}`);

      // Используем транзакцию для безопасного чтения/создания
      const result = await recordRef.transaction((data) => {
        if (data !== null) {
          // Запись существует, возвращаем как есть
          return data;
        }
        // Запись не существует, создаем новую
        // Примечание: actualStudents нужно получать снаружи транзакции
        return null; // Сигнал что нужно создать запись
      });

      let response;

      if (result.snapshot.val() === null) {
        // Создаем новую запись
        response = await createEmptyMonthlyRecord(teacherId, yearNum, monthNum);
        await recordRef.set(response);
        console.info(`📝 Created new monthly record: ${recordId}`);
      } else {
        // Обновляем существующую запись с актуальными студентами
        const data = result.snapshot.val();
        const now = getAlmatyNow();
        const actualStudents = await getStudentsByTeacher(teacherId);
        const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
        const currentStudents = data?.students || [];

        // 🔧 ИСПРАВЛЕНИЕ: Сохраняем ВСЕХ студентов из записи + добавляем новых
        const existingStudentsMap = new Map();

        // Добавляем всех существующих студентов (включая переведенных)
        currentStudents.forEach((student) => {
          existingStudentsMap.set(student.studentId, student);
        });

        // Обновляем/добавляем только активных студентов
        actualStudents.forEach((student) => {
          const existing = existingStudentsMap.get(student.id) || {};

          const activityPeriod = existing.activityPeriod || {
            startDate: now.toISOString(),
            startYear: now.getFullYear(),
            startMonth: now.getMonth() + 1,
            startDay: now.getDate(),
            endDate: null,
            endYear: null,
            endMonth: null,
            endDay: null,
          };

          // Обновляем информацию об активном студенте
          existingStudentsMap.set(student.id, {
            ...existing, // Сохраняем дополнительные поля и attendance
            studentId: student.id,
            studentName: student.fullName,
            attendance: existing.attendance || {},
            groupId: student.groupId,
            groupName: student.groupInfo?.name || "",
            groupInfo: student.groupInfo || null,
            activityPeriod,
            availableDays: Array.from({ length: daysInMonth }, (_, i) => i + 1),
          });
        });

        // Конвертируем Map обратно в массив
        const allStudents = Array.from(existingStudentsMap.values());

        response = {
          teacherId,
          year: yearNum,
          month: monthNum,
          students: allStudents,
          metadata: {
            totalStudents: allStudents.length,
            activeStudents: actualStudents.length, // Количество активных
            updatedAt: getAlmatyTimestamp(),
            schemaVersion: 1,
            ...(data?.metadata?.createdAt
              ? { createdAt: data.metadata.createdAt }
              : { createdAt: getAlmatyTimestamp() }),
          },
          daysInMonth,
          recordExists: true,
          withActivityPeriods: true,
        };

        // Обновляем только если есть изменения в активных студентах
        if (actualStudents.length !== (data.metadata?.activeStudents || 0)) {
          await recordRef.update({
            students: response.students,
            "metadata/updatedAt": getAlmatyTimestamp(),
            "metadata/totalStudents": allStudents.length,
            "metadata/activeStudents": actualStudents.length,
          });
          console.info(
            `🔄 Updated monthly record: ${recordId} with ${allStudents.length} total students (${actualStudents.length} active)`
          );
        }
      }

      res.json(response);
    } catch (error) {
      console.error("❌ Error in getMonthlyAttendance:", error);
      res.status(500).json({ error: error.message });
    }
  });
});

exports.updateAttendance = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      const { teacherId, year, month, studentId, date, status } = req.body;

      // Улучшенная валидация
      if (!teacherId || !year || !month || !studentId || !date) {
        return res.status(400).json({
          error: "Required fields: teacherId, year, month, studentId, date",
        });
      }

      // Проверяем наличие поля status (может быть null)
      if (!("status" in req.body)) {
        return res.status(400).json({
          error: "Field 'status' is required (can be null)",
        });
      }

      const yearNum = parseInt(year);
      const monthNum = parseInt(month);
      const dateNum = parseInt(date);

      if (isNaN(yearNum) || isNaN(monthNum) || isNaN(dateNum)) {
        return res
          .status(400)
          .json({ error: "year, month, and date must be valid numbers" });
      }

      // Улучшенная проверка статуса
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `status must be one of: ${VALID_STATUSES.map(String).join(
            ", "
          )}`,
        });
      }

      // Проверка админских прав (опционально)
      const hasAccess = await verifyAdminAccess(req);
      if (!hasAccess) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const recordId = `${teacherId}_${year}_${month}`;
      const recordRef = db.ref(`monthly_records/${recordId}`);
      const snapshot = await recordRef.once("value");

      if (!snapshot.exists()) {
        return res
          .status(404)
          .json({ error: "Monthly attendance record not found" });
      }

      const record = snapshot.val();
      const students = record.students || [];

      const studentIndex = students.findIndex((s) => s.studentId === studentId);
      if (studentIndex === -1) {
        return res
          .status(404)
          .json({ error: "Student not found in this attendance record" });
      }

      const student = students[studentIndex];
      const dateKey = String(dateNum);

      // Используем транзакцию для безопасного обновления
      await recordRef
        .child(`students/${studentIndex}/attendance`)
        .transaction((prevAttendance) => {
          const attendance = prevAttendance || {};
          if (status === null) {
            delete attendance[dateKey];
          } else {
            attendance[dateKey] = status;
          }
          return attendance;
        });

      // Обновляем метаданные
      await recordRef.child("metadata/updatedAt").set(getAlmatyTimestamp());
      console.info(
        `✅ Attendance updated: ${studentId} | ${year}-${month}-${date} => ${
          status || "removed"
        }`
      );

      res.json({
        success: true,
        message: `Attendance updated for ${student.studentName}`,
        updated: {
          studentId,
          studentName: student.studentName,
          date: dateNum,
          status: status || "not marked",
          groupName: student.groupName || "Unknown group",
        },
        activityPeriod: student.activityPeriod,
      });
    } catch (error) {
      console.error("❌ Error updating attendance:", error);
      res.status(500).json({ error: error.message });
    }
  });
});

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
// Статусы, которые считаются "уже отмечено"
const SET_STATUSES = new Set(["present", "absent", "late", "excused"]);

const toLc = (v) => String(v ?? "").toLowerCase();
const pad2 = (n) => String(n).padStart(2, "0");

/** Проверка "конец занятия уже прошёл" для строкового времени "HH:mm" (локально для Алматы). */
function isPastEndTimeHHmm(endTimeHHmm, now = getAlmatyNow()) {
  if (typeof endTimeHHmm !== "string") return false;
  const m = endTimeHHmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return false;

  const end = new Date(now);
  end.setHours(h, min, 0, 0);
  return now.getTime() >= end.getTime();
}

exports.autoMarkPresents = functions
  .region("us-central1") // ВАЖНО: совпадает с регионовским топиком Cloud Scheduler
  .pubsub.schedule("0 22 * * 1-6") // пн–сб, 22:00
  .timeZone(TZ)
  .onRun(async () => {
    try {
      const now = getAlmatyNow();
      const todayName = DAY_NAMES[now.getDay()];
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const day = now.getDate();

      console.info(
        `🕐 autoMarkPresents @22:00 ${year}-${pad2(month)}-${pad2(
          day
        )} (${todayName})`
      );

      if (todayName === "sunday") {
        console.info("📅 Skip Sunday");
        return null;
      }

      // --- 1) читаем группы
      const groupsSnap = await db.ref("groups").once("value");
      const groupsObj = groupsSnap.val() || {};

      const groupsTodayMap = new Map();

      for (const [groupId, groupData] of Object.entries(groupsObj)) {
        if (!groupData || !groupData.teacherId) {
          console.debug(`⚠️ Skip group ${groupId}: no teacherId or data`);
          continue;
        }

        let added = false;

        // Новый формат: schedule: [{ days:[], startTime, endTime }, ...]
        if (Array.isArray(groupData.schedule)) {
          for (const [slotIndex, slot] of groupData.schedule.entries()) {
            const days = Array.isArray(slot?.days)
              ? slot.days.map(toLc)
              : undefined;
            if (
              days?.includes(todayName) &&
              slot?.endTime &&
              isPastEndTimeHHmm(slot.endTime, now)
            ) {
              groupsTodayMap.set(`${groupId}_${slotIndex}`, {
                id: groupId,
                teacherId: groupData.teacherId,
                name: groupData.name || groupId,
                startTime: slot.startTime || null,
                endTime: slot.endTime,
              });
              added = true;
            }
          }
        }
        // Старый формат: { days:[], startTime, endTime }
        else if (Array.isArray(groupData.days)) {
          const days = groupData.days.map(toLc);
          if (
            days.includes(todayName) &&
            groupData?.endTime &&
            isPastEndTimeHHmm(groupData.endTime, now)
          ) {
            groupsTodayMap.set(groupId, {
              id: groupId,
              teacherId: groupData.teacherId,
              name: groupData.name || groupId,
              startTime: groupData.startTime || null,
              endTime: groupData.endTime,
            });
            added = true;
          }
        }

        if (!added) {
          console.debug(`📭 No ended lessons today for group ${groupId}`);
        }
      }

      const groupsToday = Array.from(groupsTodayMap.values());
      if (groupsToday.length === 0) {
        console.info("📭 No groups had classes today");
        return null;
      }

      console.info(
        `📚 Found ${groupsToday.length} groups today:`,
        groupsToday.map((g) => g.name)
      );

      // --- 2) группируем по преподавателям
      const teachersMap = new Map();
      for (const g of groupsToday) {
        if (!teachersMap.has(g.teacherId)) teachersMap.set(g.teacherId, []);
        teachersMap.get(g.teacherId).push(g);
      }

      // --- 3) для каждого преподавателя создаём/читаем запись месяца и проставляем present
      for (const [teacherId, teacherGroups] of teachersMap) {
        const recordId = `${teacherId}_${year}_${pad2(month)}`;
        const recordRef = db.ref(`monthly_records/${recordId}`);

        // ensure monthly record exists
        const recSnap = await recordRef.once("value");
        if (!recSnap.exists()) {
          console.info(
            `📝 Creating monthly record for ${teacherId} ${year}-${pad2(month)}`
          );
          const newRecord = await createEmptyMonthlyRecord(
            teacherId,
            year,
            month
          );
          await recordRef.set(newRecord);
        }

        const freshSnap = await recordRef.once("value");
        const record = freshSnap.val() || {};
        const students = record.students || [];

        // NB: учитываем только сам факт "у группы был урок сегодня и он закончился"
        const groupIdsToday = new Set(teacherGroups.map((g) => g.id));

        let changes = 0;
        const updates = {};
        const todayKey = String(day);

        for (let i = 0; i < students.length; i++) {
          const st = students[i];
          if (!groupIdsToday.has(st.groupId)) continue;

          const current =
            (st.attendance && st.attendance[todayKey]) ?? undefined;

          if (!SET_STATUSES.has(current)) {
            updates[`students/${i}/attendance/${todayKey}`] = "present";
            changes++;
          }
        }

        if (changes > 0) {
          updates["metadata/updatedAt"] = getAlmatyTimestamp();
          await recordRef.update(updates);
          console.info(
            `✅ ${teacherId}: auto-marked ${changes} students as 'present' for ${year}-${pad2(
              month
            )}-${pad2(day)}`
          );
        } else {
          console.info(`📋 ${teacherId}: no changes needed`);
        }
      }

      console.info("🏁 autoMarkPresents completed successfully");
      return null;
    } catch (err) {
      console.error("❌ autoMarkPresents failed:", err);
      return null;
    }
  });
