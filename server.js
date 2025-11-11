import express from "express";
import axios from "axios";
import qs from "querystring";

const app = express();
const PORT = 3000;

const CLICKUP_API_KEY =
    process.env.CLICKUP_API_KEY ||
    "pk_288875890_B54GXF7ZBTEWSFCNCECR25G7HM099DGW";

// ⚙️ Cho phép Express đọc nhiều loại body
app.use(express.text({ type: "*/*" })); // đọc raw text
app.use(express.json({ limit: "1mb" })); // đọc JSON hợp lệ
app.use(express.urlencoded({ extended: true })); // đọc form-urlencoded

const log = (...args) => console.log("[ClickUpWebhook]", ...args);

/**
 * 📩 Webhook chính
 */
app.post("/api/clickup/webhook", async (req, res) => {
    try {
        log("Webhook received!");
        log("Headers:", req.headers);

        // --- 1️⃣ Đảm bảo luôn có raw string body ---
        let rawBody = "";
        if (typeof req.body === "string") {
            rawBody = req.body;
        } else if (typeof req.body === "object" && Object.keys(req.body).length > 0) {
            rawBody = JSON.stringify(req.body);
        }

        log("Raw Body:", rawBody);

        if (!rawBody || rawBody.trim().length === 0) {
            log("❌ Error: No post data received");
            return res.status(400).json({ success: false, error: "No data" });
        }

        // --- 2️⃣ Parse body linh hoạt ---
        let data = {};
        try {
            if (typeof req.body === "object" && Object.keys(req.body).length > 0) {
                data = req.body;
            } else {
                data = JSON.parse(rawBody);
            }
        } catch (err) {
            data = qs.parse(rawBody); // fallback nếu ClickUp gửi form
        }

        log("Parsed data:", data);

        // --- 3️⃣ Lấy thông tin task ---
        let taskId;
        let startDate;
        let estimate;

        if (data.task_id) {
            taskId = data.task_id;
            const taskDetails = await getTaskDetails(taskId);
            startDate = taskDetails.start_date;
            estimate = taskDetails.time_estimate;
        } else if (data.task && data.task.id) {
            taskId = data.task.id;
            startDate = data.task.start_date;
            estimate = data.task.time_estimate;
        } else if (data.event && data.event.includes("task")) {
            taskId = data.task_id || data?.payload?.task_id;
            const taskDetails = await getTaskDetails(taskId);
            startDate = taskDetails.start_date;
            estimate = taskDetails.time_estimate;
        } else {
            throw new Error("Cannot find task data in webhook payload");
        }

        log("Task ID:", taskId);
        log("Start Date:", startDate);
        log("Estimate:", estimate);

        if (!startDate || !estimate) throw new Error("Missing start_date or estimate");

        const startMs = parseInt(startDate);
        const estMs = parseInt(estimate);

        if (isNaN(startMs) || isNaN(estMs)) throw new Error("Invalid date format");

        const dueDate = new Date(startMs + estMs);
        log("Computed due date:", dueDate.toISOString());

        const success = await updateTaskDueDate(taskId, dueDate.getTime());
        if (!success) throw new Error("Failed to update due date");

        log("✅ Successfully updated task:", taskId);
        return res.status(200).json({
            success: true,
            task_id: taskId,
            due_date: dueDate.toISOString(),
        });
    } catch (err) {
        log("❌ Error:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * 📦 Lấy task chi tiết
 */
async function getTaskDetails(taskId) {
    const url = `https://api.clickup.com/api/v2/task/${taskId}`;
    const headers = {
        Authorization: CLICKUP_API_KEY,
        "Content-Type": "application/json",
    };

    const res = await axios.get(url, { headers });
    log("Get Task:", res.status);

    if (res.status !== 200) throw new Error("Failed to fetch task");
    return res.data;
}

/**
 * 🧩 Cập nhật due date
 */
async function updateTaskDueDate(taskId, dueDate) {
    const url = `https://api.clickup.com/api/v2/task/${taskId}`;
    const headers = {
        Authorization: CLICKUP_API_KEY,
        "Content-Type": "application/json",
    };

    const body = { due_date: dueDate, due_date_time: true };
    const res = await axios.put(url, body, { headers });
    log("Update:", res.status);

    return res.status === 200;
}

/**
 * 🔑 Test API Key (GET)
 */
app.get("/api/clickup/testApiKey", async (req, res) => {
    try {
        const resp = await axios.get("https://api.clickup.com/api/v2/user", {
            headers: { Authorization: CLICKUP_API_KEY },
        });
        res.json({ ok: true, user: resp.data });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.listen(PORT, () =>
    log(`🚀 Server running on http://localhost:${PORT}`)
);
