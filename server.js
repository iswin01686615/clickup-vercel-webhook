import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
const PORT = 3000;

// API key (nên để trong .env)
const CLICKUP_API_KEY =
    process.env.CLICKUP_API_KEY ||
    "pk_288875890_FLZ0W78Z6POOO7QHBSB96BY243KWTOVM";

console.log("🔑 ClickUp API Key Loaded:", CLICKUP_API_KEY ? "✅ OK" : "❌ MISSING");

app.use(bodyParser.json());

app.all("/api/clickup/webhook", async (req, res) => {
    if (req.method !== "GET" && req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        // --- 1️⃣ Lấy task_id và event ---
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

        // --- 2️⃣ Lấy danh sách team_id từ ClickUp ---
        const teamsRes = await axios.get("https://api.clickup.com/api/v2/team", {
            headers: { Authorization: CLICKUP_API_KEY },
        });

        const teams = teamsRes.data.teams || [];
        if (teams.length === 0) {
            throw new Error("No teams found for this token");
        }

        // Nếu có nhiều workspace, chọn theo tên hoặc lấy team đầu tiên
        const team =
            teams.find((t) => t.name.includes("Elearning")) || teams[0];
        const teamId = team.id;

        console.log(`✅ Using Team ID: ${teamId} (${team.name})`);

        // --- 3️⃣ Lấy thông tin task ---
        const taskRes = await axios.get(
            `https://api.clickup.com/api/v2/task/${taskId}`,
            {
                headers: { Authorization: CLICKUP_API_KEY },
            }
        );

        const task = taskRes.data;
        const startDate = parseInt(task.start_date);
        const estimate = parseInt(task.time_estimate);

        if (!startDate || !estimate) {
            console.log("⚠️ Missing start_date or estimate");
            return res.status(200).json({
                success: false,
                message: "No start_date or estimate found",
                task_id: taskId,
            });
        }

        // --- 4️⃣ Tính toán due_date ---
        const dueDate = startDate + estimate;
        const dueISO = new Date(dueDate).toISOString();
        console.log(`🧮 Computed due_date = ${dueISO}`);

        // --- 5️⃣ Cập nhật task (thêm team_id để tránh OAUTH_027) ---
        const updateRes = await axios.put(
            `https://api.clickup.com/api/v2/task/${taskId}?team_id=${teamId}`,
            { due_date: dueDate, due_date_time: true },
            { headers: { Authorization: CLICKUP_API_KEY } }
        );

        console.log(
            `✅ Updated task ${taskId}, status=${updateRes.status}, due_date=${dueISO}`
        );

        return res.status(200).json({
            success: true,
            task_id: taskId,
            team_id: teamId,
            due_date: dueISO,
        });
    } catch (err) {
        const errorData = err.response?.data || err.message;
        console.error("❌ Error:", errorData);
        return res.status(500).json({
            success: false,
            error: errorData,
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
