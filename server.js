import express from "express";
import axios from "axios";
import qs from "querystring";

const app = express();
const PORT = 3000;

// 🔑 API key ClickUp (có thể thay bằng process.env.CLICKUP_API_KEY)
const CLICKUP_API_KEY =
    process.env.CLICKUP_API_KEY ||
    "pk_288875890_FLZ0W78Z6POOO7QHBSB96BY243KWTOVM";

// Middleware đọc toàn bộ payload (ClickUp đôi khi gửi text/plain)
app.use(express.text({ type: "*/*" }));

// Hàm log tiện ích
const log = (...args) => console.log("[ClickUpWebhook]", ...args);

/**
 * 📩 Hàm xử lý webhook chính
 */
app.post("/api/clickup/webhook", async (req, res) => {
    try {
        log("Webhook received!");
        log("Headers:", req.headers);

        if (!req.body || req.body.trim().length === 0) {
            log("❌ Error: No post data received");
            return res
                .status(400)
                .json({ success: false, error: "No data received" });
        }

        const raw = req.body;
        log("Raw Payload:", raw);

        // ClickUp đôi khi gửi form-urlencoded
        let data = {};
        try {
            data = JSON.parse(raw);
        } catch (err) {
            data = qs.parse(raw);
        }

        log("Parsed data:", data);

        // --- Giữ nguyên logic gốc ---
        let taskId;
        let startDate;
        let estimate;

        if (data.task_id) {
            // Cấu trúc webhook đơn giản
            taskId = data.task_id;
            const taskDetails = await getTaskDetails(taskId);
            startDate = taskDetails.start_date;
            estimate = taskDetails.time_estimate;
        } else if (data.task && data.task.id) {
            // Webhook có đủ thông tin task
            taskId = data.task.id;
            startDate = data.task.start_date;
            estimate = data.task.time_estimate;
        } else if (data.event && data.event.includes("task")) {
            // Webhook theo kiểu event
            taskId = data.task_id || (data.payload && data.payload.task_id);
            const taskDetails = await getTaskDetails(taskId);
            startDate = taskDetails.start_date;
            estimate = taskDetails.time_estimate;
        } else {
            throw new Error("Cannot find task data in webhook payload");
        }

        log("Task ID:", taskId);
        log("Start Date:", startDate);
        log("Time Estimate:", estimate);

        if (!startDate || !estimate) {
            throw new Error("Missing start_date or time_estimate");
        }

        const startDateMs = parseInt(startDate);
        const estimateMs = parseInt(estimate);

        if (isNaN(startDateMs) || isNaN(estimateMs)) {
            throw new Error("Invalid date format");
        }

        const dueDate = new Date(startDateMs + estimateMs);
        log("Computed due date:", dueDate.getTime());

        const updateSuccess = await updateTaskDueDate(taskId, dueDate.getTime());

        if (updateSuccess) {
            log("✅ Successfully updated due date for task:", taskId);
            return res.status(200).json({
                success: true,
                message: "Due date updated successfully",
                due_date: dueDate.toISOString(),
            });
        } else {
            throw new Error("Failed to update due date");
        }
    } catch (error) {
        log("❌ Error:", error.toString());
        return res.status(500).json({ success: false, error: error.toString() });
    }
});

/**
 * 📦 Hàm lấy thông tin chi tiết task từ ClickUp API
 */
async function getTaskDetails(taskId) {
    const url = `https://api.clickup.com/api/v2/task/${taskId}`;
    const headers = {
        Authorization: CLICKUP_API_KEY,
        "Content-Type": "application/json",
    };

    const response = await axios.get(url, { headers });
    log("Get Task Response Code:", response.status);

    if (response.status !== 200) {
        throw new Error("Failed to fetch task details: " + response.data);
    }

    return response.data;
}

/**
 * 🧩 Hàm cập nhật due_date lên ClickUp
 */
async function updateTaskDueDate(taskId, dueDateTimestamp) {
    const url = `https://api.clickup.com/api/v2/task/${taskId}`;
    const headers = {
        Authorization: CLICKUP_API_KEY,
        "Content-Type": "application/json",
    };

    const payload = {
        due_date: dueDateTimestamp,
        due_date_time: true,
    };

    const response = await axios.put(url, payload, { headers });
    log("Update Response Code:", response.status);
    log("Update Response:", response.data);

    return response.status === 200;
}

/**
 * 🧪 Hàm test API key
 */
app.get("/api/clickup/testApiKey", async (req, res) => {
    try {
        const url = "https://api.clickup.com/api/v2/user";
        const response = await axios.get(url, {
            headers: { Authorization: CLICKUP_API_KEY },
        });

        log("🔑 API Key Test Response Code:", response.status);
        log("🔑 API Key Test Response:", response.data);

        return res.json({
            status: response.status === 200 ? "✅ OK" : "❌ FAILED",
            data: response.data,
        });
    } catch (err) {
        log("❌ API Key test error:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

/**
 * 🧪 Test thủ công local
 */
app.get("/api/clickup/testWebhook", async (req, res) => {
    const taskId = req.query.task_id || "86evfm5bq"; // thay ID thật
    log("🧪 Testing webhook for:", taskId);

    const task = await getTaskDetails(taskId);
    const startDate = parseInt(task.start_date);
    const estimate = parseInt(task.time_estimate);

    const dueDate = startDate + estimate;
    const updateSuccess = await updateTaskDueDate(taskId, dueDate);

    return res.json({
        success: updateSuccess,
        due_date: new Date(dueDate).toISOString(),
    });
});

app.listen(PORT, () => {
    log(`🚀 Server running on http://localhost:${PORT}`);
});
