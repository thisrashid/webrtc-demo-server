const Socket = require("websocket").server;
const http = require("http");
const StaticServer = require("node-static").Server;
// const https = require("https");
const fs = require("fs");

// const options = {
//   key: fs.readFileSync("./ssl/localhost.key"),
//   cert: fs.readFileSync("./ssl/localhost.crt"),
// };

// const server = https.createServer(options, (req, res) => {
//   res.writeHead(200);
//   res.end("hello world\n");
// });

const fileServer = new StaticServer("./public");

const server = http.createServer((req, res) => {
  req
    .addListener("end", function () {
      fileServer.serve(req, res, function (e, result) {
        if (e && e.status === 404) {
          fileServer.serveFile("/index.html", 200, {}, req, res);
        }
      });
    })
    .resume();
  // res.writeHead(200);
  // res.end("hello world\n");
});

server.listen(process.env.PORT || 4000, () => {
  console.log("Listening on port 4000...");
});

const webSocket = new Socket({
  httpServer: server,
  autoAcceptConnections: false,
});

function originIsAllowed(origin) {
  // put logic here to detect whether the specified origin is allowed.
  return true;
}

let users = [];

webSocket.on("request", (req) => {
  if (!originIsAllowed(req.origin)) {
    // Make sure we only accept requests from an allowed origin
    req.reject();
    console.log(
      new Date() + " Connection from origin " + req.origin + " rejected."
    );
    return;
  }
  // const connection = req.accept();
  const connection = req.accept("json", req.origin);

  connection.on("message", (message) => {
    const data = JSON.parse(message.utf8Data);
    console.log("Recieved : ", data.type, data.target, data.username);

    const user = users.find((user) => user.username === data.username);
    const targetUser =
      users.find((user) => user.username === data.target) || {};

    switch (data.type) {
      case "store_user":
        if (user) {
          return;
        }

        const newUser = {
          conn: connection,
          username: data.username,
        };

        users.push(newUser);
        console.log("New user stored", newUser.username);
        users.forEach((u) => {
          sendData(
            {
              type: "userlist",
              users: users.map((user) => user.username),
            },
            u.conn
          );
        });

        break;
      case "store_offer":
        if (!user) return;
        user.offer = data.offer;
        sendData(
          {
            target: data.target,
            from: data.username,
            type: "offer",
            offer: data.offer,
          },
          targetUser.conn
        );
        break;

      case "store_candidate":
        if (!user) {
          return;
        }
        if (!user.candidates) user.candidates = [];

        user.candidates.push(data.candidate);
        break;
      case "send_answer":
        if (!user) {
          return;
        }
        console.log("sending answer to : ", user.username);
        sendData(
          {
            type: "answer",
            answer: data.answer,
          },
          user.conn
        );
        break;
      case "send_candidate":
        if (!user) {
          return;
        }

        sendData(
          {
            type: "candidate",
            candidate: data.candidate,
          },
          user.conn
        );
        break;
      case "join_call":
        if (!user) {
          return;
        }

        sendData(
          {
            type: "offer",
            offer: user.offer,
          },
          connection
        );

        (user.candidates || []).forEach((candidate) => {
          sendData(
            {
              type: "candidate",
              candidate: candidate,
            },
            connection
          );
        });

        break;

      case "end_call":
        sendData(
          {
            type: "end_call",
          },
          targetUser.conn
        );
        break;
    }
  });

  connection.on("close", (reason, description) => {
    users.forEach((user) => {
      if (user.conn == connection) {
        console.log("User disconnected : ", user.username);
        users.splice(users.indexOf(user), 1);
        return;
      }
    });
  });
});

function sendData(data, conn) {
  // console.log("Sending: ", data.type);
  if (!conn) {
    console.log("recipient user not found", data);
  } else {
    conn.send(JSON.stringify(data));
  }
}
