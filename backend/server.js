const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const pty = require("node-pty");
const os = require("os");
const cors = require("cors");
const axios = require("axios"); // Make sure axios is installed

const app = express();
app.use(
  cors({
    origin: "http://localhost:3000", // Frontend URL
    methods: ["GET", "POST"],
    credentials: true,
  })
);
app.use(express.json()); // Parse JSON request bodies

// Proxy endpoint for OpenRouter API
app.post("/api/proxy/openrouter", async (req, res) => {
  try {
    const { prompt, apiKey, model } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: "API key is required" });
    }

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: model || "anthropic/claude-3.5-sonnet",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 150,
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("Proxy error:", error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data || "Unknown error",
    });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Determine shell based on operating system
const shell = os.platform() === "win32" ? "powershell.exe" : "zsh";

io.on("connection", (socket) => {
  console.log("Client connected");

  // Spawn a shell process
  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-color",
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: process.env,
  });

  // Handle terminal input from client
  socket.on("input", (data) => {
    ptyProcess.write(data);
  });

  // Send terminal output to client
  ptyProcess.onData((data) => {
    socket.emit("output", data);
  });

  // Handle resize events
  socket.on("resize", (size) => {
    ptyProcess.resize(size.cols, size.rows);
  });

  // Clean up on disconnect
  socket.on("disconnect", () => {
    console.log("Client disconnected");
    ptyProcess.kill();
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
