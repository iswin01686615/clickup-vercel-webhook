import express from "express";
import axios from "axios";
import qs from "querystring";

const app = express();
const PORT = 3000;

// 🔐 Token fix cứng trong mã nguồn
const CLICKUP_API_KEY = "pk_288875890_TR7AIEA29E6NLA4EENC7OUPO036JBKHQ";

// Middleware: hỗ trợ mọi loại body (ClickUp gửi content-type khác nhau)
app.use(express.text({ type: "*/*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const log = (...args) => console.log("[ClickUpWebhook]", ...args);

// 🧩 Route nhận Task ID qua URL
app.post("/api/clickup/webhook/:id", async (req, res) => {
    try {
        const taskIdFromUrl = req.params.id;
        log(`📩 Webhook triggered for Task ID (from URL): ${taskIdFromUrl}`);

        // --- Đọc raw body ---
        let rawBody = "";
        if (typeof req.body === "string") rawBody = req.body;
        else if (typeof req.body === "object" && Object.keys(req.body).length > 0)
            rawBody = JSON.stringify(req.body);

        log("📥 Raw Body:", rawBody);

        let data = {};
        try {
            data =
                typeof req.body === "object" && Object.keys(req.body).length > 0
                    ? req.body
                    : JSON.parse(rawBody);
        } catch {
            data = qs.parse(rawBody);
        }

        // --- Ưu tiên task ID trong URL ---
        const taskId =
            taskIdFromUrl ||
            data.task_id ||
            data?.task?.id ||
            data?.payload?.task_id ||
            req.query.task_id;

        const event =
            data.event || data?.type || data?.webhook_event || req.query.event;

        if (!taskId) {
            log("⚠️ Missing task_id (even in URL)");
            return res.status(400).json({ success: false, error: "Missing task_id" });
        }

        log(`📦 Detected Task ID: ${taskId}, Event: ${event}`);

        // --- Lấy task details ---
        const task = await getTaskDetails(taskId);
        const startDate = parseInt(task.start_date);
        const estimate = parseInt(task.time_estimate);

        if (!startDate || !estimate) {
            log("⚠️ Missing start_date or time_estimate");
            return res.status(200).json({
                success: false,
                message: "No start_date or estimate",
                task_id: taskId,
            });
        }

        const dueDate = startDate + estimate;
        const dueISO = new Date(dueDate).toISOString();
        log(`🧮 Computed due_date = ${dueISO}`);

        const success = await updateTaskDueDate(taskId, dueDate);
        if (!success) throw new Error("Failed to update due_date");

        log(`✅ Updated task ${taskId} with due_date ${dueISO}`);
        return res.status(200).json({
            success: true,
            task_id: taskId,
            due_date: dueISO,
        });
    } catch (err) {
        log("❌ Error:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// --- Lấy thông tin task từ ClickUp ---
async function getTaskDetails(taskId) {
    const url = `https://api.clickup.com/api/v2/task/${taskId}`;
    const headers = { Authorization: CLICKUP_API_KEY };
    const res = await axios.get(url, { headers });
    if (res.status !== 200) throw new Error("Failed to fetch task");
    return res.data;
}

// --- Cập nhật due_date ---
async function updateTaskDueDate(taskId, dueDate) {
    const url = `https://api.clickup.com/api/v2/task/${taskId}`;
    const headers = {
        Authorization: CLICKUP_API_KEY,
        "Content-Type": "application/json",
    };
    const payload = {
        due_date: dueDate,
        due_date_time: true,
    };
    const res = await axios.put(url, payload, { headers });
    return res.status === 200;
}

app.listen(PORT, () =>
    log(`🚀 Server running on http://localhost:${PORT}`)
);
