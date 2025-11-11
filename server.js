import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
const PORT = 3000;
const CLICKUP_API_KEY = process.env.CLICKUP_API_KEY || "pk_288875890_B54GXF7ZBTEWSFCNCECR25G7HM099DGW";

app.use(bodyParser.json());

app.all("/api/clickup/webhook", async (req, res) => {
    // Chấp nhận cả GET và POST
    if (req.method !== "GET" && req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        // --- 1. Lấy task_id và event ---
        const taskId =
            req.query.task_id ||
            req.body?.task_id ||
            req.body?.task?.id ||
            req.body?.payload?.task_id;
        const event = req.query.event || req.body?.event;

        if (!taskId) {
            return res.status(400).json({ error: "Missing task_id" });
        }

        console.log(`📩 Webhook received: task_id=${taskId}, event=${event}`);

        // --- 2. Lấy thông tin task từ ClickUp ---
        const taskRes = await axios.get(`https://api.clickup.com/api/v2/task/${taskId}`, {
            headers: { Authorization: CLICKUP_API_KEY },
        });

        const task = taskRes.data;
        const startDate = parseInt(task.start_date);
        const estimate = parseInt(task.time_estimate);

        if (!startDate || !estimate) {
            console.log("⚠️ Missing start_date or estimate");
            return res.status(200).json({ message: "No start_date or estimate" });
        }

        // --- 3. Tính toán due_date ---
        const dueDate = startDate + estimate;
        console.log(`🧮 Computed due_date = ${new Date(dueDate).toISOString()}`);

        // --- 4. Cập nhật task ---
        await axios.put(
            `https://api.clickup.com/api/v2/task/${taskId}`,
            { due_date: dueDate, due_date_time: true },
            { headers: { Authorization: CLICKUP_API_KEY } }
        );

        console.log(`✅ Updated task ${taskId}`);

        return res.status(200).json({
            success: true,
            task_id: taskId,
            due_date: new Date(dueDate).toISOString(),
        });
    } catch (err) {
        console.error("❌ Error:", err.response?.data || err.message);
        return res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
