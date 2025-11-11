import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
const PORT = 3000;
const CLICKUP_API_KEY = process.env.CLICKUP_API_KEY || "pk_288875890_B54GXF7ZBTEWSFCNCECR25G7HM099DGW";

app.use(bodyParser.json());

app.post("/api/clickup/webhook", async (req, res) => {
    console.log("📩 Webhook received:", req.body);

    try {
        const taskId = req.body.task_id || req.body.task?.id || req.body.payload?.task_id;
        if (!taskId) {
            console.log("⚠️ Missing task_id");
            return res.status(400).json({ error: "Missing task_id" });
        }

        const taskRes = await axios.get(`https://api.clickup.com/api/v2/task/${taskId}`, {
            headers: { Authorization: CLICKUP_API_KEY }
        });

        const task = taskRes.data;
        const startDate = parseInt(task.start_date);
        const estimate = parseInt(task.time_estimate);

        if (!startDate || !estimate) {
            console.log("⚠️ Missing start_date or estimate");
            return res.status(200).json({ message: "No start_date or estimate" });
        }

        const dueDate = startDate + estimate;
        console.log(`🧮 Computed due_date = ${new Date(dueDate).toISOString()}`);

        await axios.put(
            `https://api.clickup.com/api/v2/task/${taskId}`,
            { due_date: dueDate, due_date_time: true },
            { headers: { Authorization: CLICKUP_API_KEY } }
        );

        console.log(`✅ Updated task ${taskId}`);
        res.json({ success: true, due_date: new Date(dueDate).toISOString() });
    } catch (err) {
        console.error("❌ Error:", err.response?.data || err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
