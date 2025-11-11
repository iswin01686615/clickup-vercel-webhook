import axios from "axios";

const CLICKUP_API_KEY = process.env.CLICKUP_API_KEY;

export default async function handler(req, res) {
    // Chỉ nhận POST (ClickUp webhook gửi POST)
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    console.log("📩 Webhook received:", req.body);

    try {
        // --- 1. Lấy task_id ---
        const taskId =
            req.body.task_id ||
            req.body.task?.id ||
            req.body.payload?.task_id ||
            null;

        if (!taskId) {
            console.log("⚠️ Missing task_id");
            return res.status(400).json({ error: "Missing task_id" });
        }

        // --- 2. Lấy thông tin task từ ClickUp ---
        const taskRes = await axios.get(`https://api.clickup.com/api/v2/task/${taskId}`, {
            headers: { Authorization: CLICKUP_API_KEY },
        });

        const task = taskRes.data;
        const startDate = parseInt(task.start_date);
        const estimate = parseInt(task.time_estimate);

        if (!startDate || !estimate) {
            console.log("⚠️ Task thiếu start_date hoặc time_estimate");
            return res.status(200).json({ message: "No start_date or estimate" });
        }

        // --- 3. Tính due_date ---
        const dueDate = startDate + estimate;
        console.log(`🧮 Computed due_date = ${new Date(dueDate).toISOString()}`);

        // --- 4. Cập nhật task ---
        await axios.put(
            `https://api.clickup.com/api/v2/task/${taskId}`,
            {
                due_date: dueDate,
                due_date_time: true
            },
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
}
