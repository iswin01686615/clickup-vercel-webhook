import express from "express";
import axios from "axios";
import qs from "querystring"; // để parse form-urlencoded

const app = express();
const PORT = 3000;

const CLICKUP_API_KEY =
    process.env.CLICKUP_API_KEY ||
    "pk_288875890_FLZ0W78Z6POOO7QHBSB96BY243KWTOVM";

console.log("🔑 ClickUp API Key Loaded:", CLICKUP_API_KEY ? "✅ OK" : "❌ MISSING");

// 👇 Middleware đọc mọi loại body (text, json, form-urlencoded)
app.use(express.text({ type: "*/*" }));

app.all("/api/clickup/webhook", async (req, res) => {
    console.log("📥 Incoming Request ----------------------");
    console.log("🔹 Method:", req.method);
    console.log("🔹 URL:", req.originalUrl);
    console.log("🔹 Headers:", JSON.stringify(req.headers, null, 2));
    console.log("🔹 Query:", JSON.stringify(req.query, null, 2));
    console.log("🔹 Raw body (string):", req.body);
    console.log("------------------------------------------");

    try {
        let body = {};
        // ✅ Parse thủ công 3 kiểu: JSON, form-urlencoded, hoặc text
        if (typeof req.body === "string" && req.body.trim().length > 0) {
            try {
                body = JSON.parse(req.body);
            } catch {
                if (req.body.includes("=")) {
                    body = qs.parse(req.body);
                } else {
                    console.log("⚠️ Không parse được body, giữ nguyên text.");
                    body = { raw: req.body };
                }
            }
        }

        console.log("📦 Parsed Body:", JSON.stringify(body, null, 2));

        // --- Lấy task_id từ nhiều nguồn ---
        const taskId =
            req.query.task_id ||
            body?.task_id ||
            body?.task?.id ||
            body?.payload?.task_id ||
            body?.data?.task_id;
        const event =
            req.query.event || body?.event || body?.type || body?.webhook_event;

        if (!taskId) {
            console.log("⚠️ Missing task_id in request");
            return res.status(400).json({
                success: false,
                error: "Missing task_id",
                parsed_body: body,
            });
        }

        console.log(`📩 Webhook received: task_id=${taskId}, event=${event}`);

        // --- Lấy team_id ---
        const teamsRes = await axios.get("https://api.clickup.com/api/v2/team", {
            headers: { Authorization: CLICKUP_API_KEY },
        });
        const teams = teamsRes.data.teams || [];
        if (teams.length === 0) throw new Error("No teams found for token");

        const team =
            teams.find((t) => t.name.includes("Elearning")) || teams[0];
        const teamId = team.id;
        console.log(`✅ Using Team ID: ${teamId} (${team.name})`);

        // --- Lấy thông tin task ---
        const taskRes = await axios.get(
            `https://api.clickup.com/api/v2/task/${taskId}`,
            { headers: { Authorization: CLICKUP_API_KEY } }
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

        const dueDate = startDate + estimate;
        const dueISO = new Date(dueDate).toISOString();
        console.log(`🧮 Computed due_date = ${dueISO}`);

        // --- Update task ---
        const updateRes = await axios.put(
            `https://api.clickup.com/api/v2/task/${taskId}?team_id=${teamId}`,
            { due_date: dueDate, due_date_time: true },
            { headers: { Authorization: CLICKUP_API_KEY } }
        );

        console.log(`✅ Updated task ${taskId}, status=${updateRes.status}`);

        return res.status(200).json({
            success: true,
            task_id: taskId,
            due_date: dueISO,
        });
    } catch (err) {
        console.error("❌ Error:", err.response?.data || err.message);
        return res
            .status(err.response?.status || 500)
            .json({ error: err.response?.data || err.message });
    }
});

app.listen(PORT, () =>
    console.log(`🚀 Server running on http://localhost:${PORT}`)
);
