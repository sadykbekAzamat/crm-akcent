import React, { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Legend, LineChart, Line, CartesianGrid } from "recharts";

const API_URL = "https://us-central1-akcent-academy.cloudfunctions.net/akcent/api/entries?none=none&status=%D0%9E%D0%BF%D0%BB%D0%B0%D1%82%D0%B0";

function groupCounts(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it) ?? "—";
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Array.from(m, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}
function sumBy(items, keyFn) { return items.reduce((acc, it) => acc + (Number(keyFn(it)) || 0), 0); }
function unique(values) { return Array.from(new Set(values.filter(Boolean))); }
function formatKZT(n) { if (n == null || isNaN(n)) return "—"; return new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 }).format(n); }
function normalizeDate(s) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* === NEW: утилиты для возраста === */
function toAgeNumber(v) {
  if (v === 0) return 0;
  if (v == null) return null;
  const m = String(v).match(/-?\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function ageBucketLabel(a) {
  if (a == null) return "Не указано";
  if (a <= 12) return "0–12";
  if (a <= 17) return "13–17";
  if (a <= 24) return "18–24";
  if (a <= 34) return "25–34";
  if (a <= 44) return "35–44";
  if (a <= 54) return "45–54";
  return "55+";
}
function avg(nums) { return nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : 0; }
function median(nums) {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

export default function AkcentAnalyticsDashboard() {
  const [data, setData] = useState([]);
  const [liveError, setLiveError] = useState(null);

  useEffect(() => {
    if(data.length === 0){
      pullLiveOnce();
    }
  }, []);


  // Фильтры
  const [query, setQuery] = useState("");
  const [teacher, setTeacher] = useState("");
  const [source, setSource] = useState("");
  const [score, setScore] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.filter((it) => {
      const matchesQ = !q
        || (it.clientName || "").toLowerCase().includes(q)
        || (it.phone || "").toLowerCase().includes(q)
        || (it.assignedTeacher || "").toLowerCase().includes(q)
        || (it.comment || "").toLowerCase().includes(q)
        || (it.source || "").toLowerCase().includes(q)
        || (it.rop || "").toLowerCase().includes(q);
      const matchesTeacher = !teacher || it.assignedTeacher === teacher;
      const matchesSource = !source || it.source === source;
      const matchesScore = !score || String(it.score) === String(score);
      return matchesQ && matchesTeacher && matchesSource && matchesScore;
    });
  }, [data, query, teacher, source, score]);

  const totalRevenue = useMemo(() => sumBy(filtered, (it) => it.paymentAmount), [filtered]);
  const avgTicket = useMemo(() => (filtered.length ? totalRevenue / filtered.length : 0), [filtered, totalRevenue]);

  const byTeacher = useMemo(() => groupCounts(filtered, (it) => it.assignedTeacher), [filtered]);
  const bySource  = useMemo(() => groupCounts(filtered, (it) => it.source), [filtered]);
  const byScore   = useMemo(() => groupCounts(filtered, (it) => String(it.score)), [filtered]);
  const byPaymentType = useMemo(() => groupCounts(filtered, (it) => it.paymentType), [filtered]);
  const byRop     = useMemo(() => groupCounts(filtered, (it) => it.rop), [filtered]);

  const teacherRevenue = useMemo(() => {
    const map = new Map();
    for (const it of filtered) {
      const k = it.assignedTeacher || "—";
      map.set(k, (map.get(k) || 0) + (Number(it.paymentAmount) || 0));
    }
    return Array.from(map, ([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue);
  }, [filtered]);

  const trialsByDate = useMemo(() => {
    const map = new Map();
    for (const it of filtered) {
      const d = normalizeDate(it.trialDate) || "—";
      map.set(d, (map.get(d) || 0) + 1);
    }
    return Array.from(map, ([date, count]) => ({ date, count })).sort((a, b) => (a.date > b.date ? 1 : -1));
  }, [filtered]);

  const mostTeacher = byTeacher[0]?.name || "—";
  const mostSource  = bySource[0]?.name || "—";
  const mostScore   = byScore[0]?.name || "—";

  const teachers = useMemo(() => unique(data.map((d) => d.assignedTeacher)), [data]);
  const sources  = useMemo(() => unique(data.map((d) => d.source)), [data]);
  const scores   = useMemo(() => unique(data.map((d) => String(d.score))).sort(), [data]);

  async function pullLiveOnce() {
    try {
      setLiveError(null);
      const r = await fetch(API_URL);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      const arr = Array.isArray(json) ? json : (json?.data ?? []);
      if (Array.isArray(arr) && arr.length) setData(arr);
    } catch (e) {
      setLiveError(String(e?.message || e));
    }
  }

  /* === NEW: аналитика по возрасту === */
  const agesNum = useMemo(() => filtered.map((it) => toAgeNumber(it.age)).filter((n) => n != null), [filtered]);
  const ageStats = useMemo(() => ({
    avg: Number.isFinite(avg(agesNum)) ? Math.round(avg(agesNum) * 10) / 10 : 0,
    med: Number.isFinite(median(agesNum)) ? Math.round(median(agesNum) * 10) / 10 : 0,
    min: agesNum.length ? Math.min(...agesNum) : 0,
    max: agesNum.length ? Math.max(...agesNum) : 0,
    count: agesNum.length,
  }), [agesNum]);

  const byAge = useMemo(() => {
    // распределение по каждому конкретному возрасту (год)
    const m = new Map();
    for (const a of agesNum) m.set(a, (m.get(a) || 0) + 1);
    return Array.from(m, ([name, count]) => ({ name: String(name), count }))
      .sort((a, b) => Number(a.name) - Number(b.name));
  }, [agesNum]);

  const byAgeBucket = useMemo(() => groupCounts(filtered, (it) => {
    const n = toAgeNumber(it.age);
    return ageBucketLabel(n);
  }), [filtered]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/80 border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Akcent — Аналитика (статическая)</h1>
          <div className="flex items-center gap-2">
            <button onClick={pullLiveOnce} className="px-3 py-2 rounded-xl border shadow-sm hover:shadow bg-white" title="Разово подтянуть из API">
              Подтянуть из API
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Фильтры */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: имя, телефон, учитель, источник, комментарий..."
            className="col-span-2 lg:col-span-3 px-3 py-2 rounded-xl border shadow-sm"
          />
          <select value={teacher} onChange={(e) => setTeacher(e.target.value)} className="px-3 py-2 rounded-xl border shadow-sm">
            <option value="">Все учителя</option>
            {teachers.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="px-3 py-2 rounded-xl border shadow-sm">
            <option value="">Все источники</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={score} onChange={(e) => setScore(e.target.value)} className="px-3 py-2 rounded-xl border shadow-sm">
            <option value="">Все оценки</option>
            {scores.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </section>

        {/* KPI */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <KpiCard label="Записей" value={filtered.length} sub={`Загружено: ${data.length}`} />
          <KpiCard label="Выручка" value={formatKZT(totalRevenue)} sub="Сумма paymentAmount" />
          <KpiCard label="Средний чек" value={formatKZT(avgTicket)} sub="Выручка / записи" />
          <KpiCard label="Чаще всего (учитель / источник / оценка)" value={`${mostTeacher} / ${mostSource} / ${mostScore}`} sub="Лидеры по частоте" />
          {/* NEW: KPI по возрасту */}
          <KpiCard label="Возраст (ср./мед., мин–макс)" value={`${ageStats.avg} / ${ageStats.med}, ${ageStats.min}–${ageStats.max}`} sub={`Есть возраст у ${ageStats.count} записей`} />
        </section>

        {/* Графики */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ChartCard title="Пробные уроки по датам">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trialsByDate} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" name="Количество" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Распределение оценок">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byScore} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name="Количество" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* NEW: Возраст — по годам */}
          <ChartCard title="Возраст — распределение по годам">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byAge} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" label={{ value: "Возраст", position: "insideBottom", offset: -5 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name="Кол-во" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* NEW: Возраст — по группам */}
          <ChartCard title="Возраст — группировка">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Tooltip />
                <Legend />
                <Pie data={byAgeBucket} dataKey="count" nameKey="name" label />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Лиды по источникам">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Tooltip />
                <Legend />
                <Pie data={bySource} dataKey="count" nameKey="name" label />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Выручка по учителям">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={teacherRevenue} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" interval={0} angle={-20} height={60} textAnchor="end" />
                <YAxis />
                <Tooltip formatter={(v) => formatKZT(v)} />
                <Legend />
                <Bar dataKey="revenue" name="Выручка (KZT)" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Лиды по учителям">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byTeacher} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" interval={0} angle={-20} height={60} textAnchor="end" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name="Количество" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>

        {/* Таблицы-лидерборды */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <TableCard title="Топ учителей (по лидам)" rows={byTeacher} cols={[{ k: "name", h: "Учитель" }, { k: "count", h: "Лидов" }]} />
          <TableCard title="Топ источников (по лидам)" rows={bySource} cols={[{ k: "name", h: "Источник" }, { k: "count", h: "Лидов" }]} />
          <TableCard title="Топ ROP (по лидам)" rows={byRop} cols={[{ k: "name", h: "ROP" }, { k: "count", h: "Лидов" }]} />
        </section>

        {/* Сырые данные */}
        <section className="bg-white rounded-2xl shadow overflow-auto">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold">Записи</h2>
            {liveError && <span className="text-sm text-red-600">Ошибка API: {liveError}</span>}
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                {["Имя","Телефон","Учитель","Источник","ROP","Оценка","Возраст","Оплата","Тип","Дата пробного","Время","Комментарий"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-700 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="odd:bg-white even:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap">{it.clientName || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{it.phone || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{it.assignedTeacher || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{it.source || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{it.rop || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{it.score ?? "—"}</td>
                  {/* NEW: колонка Возраст */}
                  <td className="px-3 py-2 whitespace-nowrap">{toAgeNumber(it.age) ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatKZT(it.paymentAmount)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{it.paymentType || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{normalizeDate(it.trialDate) || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{it.trialTime || "—"}</td>
                  <td className="px-3 py-2 max-w-[28rem]">{it.comment || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="text-xs text-gray-500 mt-6">
          По умолчанию используется статический массив из файла. Кнопка «Подтянуть из API» делает однократный fetch по адресу: <code>{API_URL}</code>.
        </footer>
      </main>
    </div>
  );
}

function KpiCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow border">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}
function ChartCard({ title, children }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow border">
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="h-[260px]">{children}</div>
    </div>
  );
}
function TableCard({ title, rows, cols }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow border overflow-auto">
      <div className="text-sm font-medium mb-2">{title}</div>
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100">
          <tr>
            {cols.map((c) => <th key={c.k} className="px-3 py-2 text-left font-medium text-gray-700 whitespace-nowrap">{c.h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className="odd:bg-white even:bg-gray-50">
              {cols.map((c) => <td key={c.k} className="px-3 py-2 whitespace-nowrap">{r[c.k]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


// ============================
// Новая страница: автодозаполнение score/age
// ============================
export function AkcentBackfillPage() {
  const ENTRIES_API = "https://us-central1-akcent-academy.cloudfunctions.net/akcent/api/entries";
  const RATING_API = "https://us-central1-akcent-academy.cloudfunctions.net/getRatingOfCard?description=";

  const [entries, setEntries] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [logs, setLogs] = React.useState([]);
  const [progress, setProgress] = React.useState({ total: 0, processed: 0, updated: 0, skipped: 0, errors: 0 });
  const [previewOnlyMissing, setPreviewOnlyMissing] = React.useState(true);

  function addLog(msg) {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    // Пишем и в UI, и в консоль (как просили)
    console.log(line);
    setLogs((prev) => [...prev, line]);
  }

  async function loadEntries() {
    setLoading(true);
    try {
      addLog("Загружаю список entries…");
      const r = await fetch(ENTRIES_API+"?none=none&status=Оплата");
      if (!r.ok) throw new Error(`GET /entries — HTTP ${r.status}`);
      const json = await r.json();
      const arr = Array.isArray(json) ? json : (json?.data ?? []);
      if (!Array.isArray(arr)) throw new Error("Некорректный формат ответа /entries");
      setEntries(arr);
      addLog(`Загружено записей: ${arr.length}`);
    } catch (e) {
      addLog(`Ошибка загрузки: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  function needsUpdate(entry) {
    const scoreUndef = entry.score === undefined || entry.score === null || entry.score === "";
    const ageUndef = entry.age === undefined || entry.age === null || entry.age === "";
    return scoreUndef || ageUndef;
  }

  function toIntOrZero(v) {
    const n = typeof v === "string" ? parseInt(v.replace(/[^0-9-]/g, ""), 10) : Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function extractScoreAge(resp) {
    // Пытаемся достать числа из разных возможных форматов
    const obj = resp || {};
    const score = obj.score ?? obj.rating ?? obj.data?.score ?? obj.data?.rating ?? obj.result?.score;
    const age = obj.age ?? obj.data?.age ?? obj.result?.age;
    return { score: toIntOrZero(score), age: toIntOrZero(age) };
  }

  async function processAll() {
    setLoading(true);
    setLogs([]);
    try {
      // 1) Получаем свежий список
      addLog("Старт обработки: тяну /entries…");
      const r = await fetch(ENTRIES_API+"?none=none&status=Оплата");
      if (!r.ok) throw new Error(`GET /entries — HTTP ${r.status}`);
      const json = await r.json();
      const arr = Array.isArray(json) ? json : (json?.data ?? []);
      if (!Array.isArray(arr)) throw new Error("Некорректный формат ответа /entries");

      const targets = arr.filter(needsUpdate);
      setEntries(arr);
      setProgress({ total: targets.length, processed: 0, updated: 0, skipped: 0, errors: 0 });
      addLog(`Нужно обработать записей с пустыми score/age: ${targets.length}`);

      // 2) Последовательно обрабатываем (чтобы не уткнуться в лимиты)
      for (let i = 0; i < targets.length; i++) {
        const entry = targets[i];
        const { id, clientName, source } = entry;
        const comment = entry.comment || "";
        addLog(`Обработка ${i + 1}/${targets.length}: id=${id}, имя=\"${clientName}\"…`);

        try {
          // 2a) GET рейтинг по description
          const description = `Имя -  ${clientName}, Источник - ${source}, ${comment}`;
          const url = RATING_API + encodeURIComponent(description);
          addLog(`GET getRatingOfCard: ${url}`);
          const rr = await fetch(url);
          if (!rr.ok) throw new Error(`GET getRatingOfCard — HTTP ${rr.status}`);
          const ratingJson = await rr.json();
          const { score, age } = extractScoreAge(ratingJson);

          const payload = {};
          if (entry.score === undefined || entry.score === null || entry.score === "") payload.score = score;
          if (entry.age === undefined || entry.age === null || entry.age === "") payload.age = age;

          if (Object.keys(payload).length === 0) {
            addLog(`id=${id}: пропуск (ничего обновлять)`);
            setProgress((p) => ({ ...p, processed: p.processed + 1, skipped: p.skipped + 1 }));
            continue;
          }

          // 2b) PUT обновление
          const putUrl = `${ENTRIES_API}/${encodeURIComponent(id)}`;
          addLog(`PUT ${putUrl} => ${JSON.stringify(payload)}`);
          const pr = await fetch(putUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!pr.ok) throw new Error(`PUT /entries/${id} — HTTP ${pr.status}`);

          addLog(`id=${id}: обновлено (score=${payload.score ?? entry.score}, age=${payload.age ?? entry.age})`);
          setProgress((p) => ({ ...p, processed: p.processed + 1, updated: p.updated + 1 }));
        } catch (e) {
          addLog(`id=${entry.id}: ошибка — ${e?.message || e}`);
          setProgress((p) => ({ ...p, processed: p.processed + 1, errors: p.errors + 1 }));
        }

        // Небольшая пауза между запросами
        await new Promise((res) => setTimeout(res, 250));
      }

      addLog("Готово: обработка завершена.");
    } catch (e) {
      addLog(`Критическая ошибка: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  const missing = React.useMemo(() => entries.filter(needsUpdate), [entries]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/80 border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Akcent — Дополнение score/age</h1>
          <div className="flex gap-2 items-center">
            <button disabled={loading} onClick={loadEntries} className="px-3 py-2 rounded-xl border shadow-sm bg-white hover:shadow disabled:opacity-50">Загрузить список</button>
            <button disabled={loading} onClick={processAll} className="px-3 py-2 rounded-xl border shadow-sm bg-white hover:shadow disabled:opacity-50">Старт обработки</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Всего" value={entries.length} />
          <KpiCard label="К обработке" value={progress.total || missing.length} />
          <KpiCard label="Обработано" value={progress.processed} />
          <KpiCard label="Обновлено" value={progress.updated} />
          <KpiCard label="Ошибок" value={progress.errors} />
        </section>

        <section className="bg-white rounded-2xl p-4 shadow border">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Записи с пустыми score/age</div>
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" checked={previewOnlyMissing} onChange={(e) => setPreviewOnlyMissing(e.target.checked)} />
              Показывать только требующие обновления
            </label>
          </div>
          <div className="overflow-auto max-h-[300px]">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  {['id','Имя','Источник','Оценка','Возраст','Комментарий'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-gray-700 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(previewOnlyMissing ? entries.filter(needsUpdate) : entries).map((it) => (
                  <tr key={it.id} className="odd:bg-white even:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{it.id}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{it.clientName || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{it.source || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{it.score ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{it.age ?? '—'}</td>
                    <td className="px-3 py-2 max-w-[24rem] whitespace-pre-wrap">{it.comment || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-2xl p-4 shadow border">
          <div className="text-sm font-medium mb-2">Логи</div>
          <pre className="text-xs bg-gray-50 p-3 rounded-xl max-h-[260px] overflow-auto whitespace-pre-wrap">{logs.join("")}</pre>
        </section>
      </main>
    </div>
  );
}

