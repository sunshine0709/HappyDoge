const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const passport = require("passport");
const path = require("path");
const cron = require("node-cron");
const Staking = require("./models/Stacking");
const connectDB = require("./config/db");
const isEmpty = require("./utils/is-Empty");
//@import
const User = require("./models/User");
const Exchange = require("./models/Exchange");
require("dotenv").config();
const getBalance = require("./routes/getBalance");
const { deposit, tranferCrypto } = require("./routes/deposit");
const { approve, reject } = require("./routes/admin");
const app = express();

// Connect Database
connectDB();

// Init Middleware
// app.use(cors());
app.use(
  cors({
    origin: ["https://www.section.io", "http://localhost:3000"],
  })
);
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// Passport middleware
app.use(passport.initialize());

// Passport Config
require("./config/passport")(passport);
// Define Routes
app.use("/users", require("./routes/users"));
app.use("/price", require("./routes/exchange"));
app.use("/transfer", require("./routes/transfer"));
app.use("/stack", require("./routes/stacking"));
app.use("/swap", require("./routes/swap"));
app.use("/history", require("./routes/history"));
app.use("/withdraw", require("./routes/withdraw"));
// app.use("/earn", require("./routes/earn"));
app.use("/referral", require("./routes/referral"));
// Serve static assets in productioncd
if (process.env.NODE_ENV === "production") {
  // Set static folder
  app.use(express.static("client/build"));

  app.get("*", (req, res) => {
    res.sendFile(path.resolve(__dirname, "client", "build", "index.html"));
  });
}
const doEveryMinute = async (socket) => {
  const today = new Date();

  // await cron.schedule("00 00 */1 * * * *", async () => {
  await cron.schedule("* * * * *", async () => {
    const currentHour = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      today.getHours(),
      today.getMinutes()
    );
    const hdtitem = await Exchange.findOne({});
    await Staking.find({ flag: true })
      .then((data) => {
        if (data) {
          data.map(async (item, key) => {
            if (
              new Date(item.end_date).getTime() ===
              new Date(currentHour).getTime()
            ) {
              if (isEmpty(hdtitem.stack_rate)) {
                return res.status(400).send({
                  error: "Stake rate is not setted",
                });
              } else {
                const userdata = await User.findById(item.user);
                userdata.countHDT =
                  userdata.countHDT +
                  item.stack_amount +
                  (((item.stack_amount * hdtitem.stack_rate) / 100) *
                    Math.abs(new Date(currentHour) - new Date(item.date))) /
                    36e5;

                item.flag = false;

                item.earned_amount =
                  item.earned_amount +
                  (((item.stack_amount * hdtitem.stack_rate) / 100) *
                    Math.abs(new Date(currentHour) - new Date(item.date))) /
                    36e5;

                const saveUser = await userdata.save();
                const itemUser = await item.save();
                if (saveUser && itemUser) {
                  const data = {
                    id: itemUser.user,
                    message: "Staking is completed",
                    amount: itemUser.earned_amount,
                  };
                  socket.emit("staking", data);
                }
              }
            } else if (item.end_date > currentHour) {
              var seconds =
                Math.floor(new Date(currentHour) - new Date(item.currentDate)) /
                1000;
              var minutes = Math.floor(seconds / 60);
              var hours = Math.floor(minutes / 60);
              if (hours === 1) {
                if (isEmpty(hdtitem.stack_rate)) {
                  return res.status(400).send({
                    error: "Stake rate is not setted",
                  });
                } else {
                  const userdata = await User.findById(item.user);
                  userdata.countHDT =
                    userdata.countHDT +
                    (((item.stack_amount * hdtitem.stack_rate) / 100) *
                      Math.abs(
                        new Date(currentHour) - new Date(item.currentDate)
                      )) /
                      36e5;

                  item.earned_amount =
                    item.earned_amount +
                    (((item.stack_amount * hdtitem.stack_rate) / 100) *
                      Math.abs(
                        new Date(currentHour) - new Date(item.currentDate)
                      )) /
                      36e5;

                  item.currentDate = currentHour;
                  const saveUser = await userdata.save();
                  const itemUser = await item.save();
                  if (saveUser && itemUser) {
                    const data = {
                      id: itemUser.user,
                      message: "Hourly stake is completed",
                      amount:
                        (((itemUser.stack_amount * hdtitem.stack_rate) / 100) *
                          Math.abs(
                            new Date(currentHour) -
                              new Date(itemUser.currentDate)
                          )) /
                        36e5,
                    };
                    socket.emit("hourly_stake", data);
                  }
                }
              }
            } else if (item.end_date < currentHour) {
              if (isEmpty(hdtitem.stack_rate)) {
                return res.status(400).send({
                  error: "Stake rate is not setted",
                });
              } else {
                const userdata = await User.findById(item.user);
                userdata.countHDT =
                  userdata.countHDT +
                  item.stack_amount +
                  (((item.stack_amount * hdtitem.stack_rate) / 100) *
                    Math.abs(new Date(item.end_date) - new Date(item.date))) /
                    36e5;
                item.flag = false;
                item.earned_amount =
                  item.earned_amount +
                  (((item.stack_amount * hdtitem.stack_rate) / 100) *
                    Math.abs(new Date(item.end_date) - new Date(item.date))) /
                    36e5;

                const saveUser = await userdata.save();
                const itemUser = await item.save();
                if (saveUser && itemUser) {
                  const data = {
                    id: itemUser.user,
                    message: "Staking is completed",
                    amount: itemUser.earned_amount,
                  };
                  socket.emit("complete_stake", data);
                }
              }
            }
          });
        } else {
        }
      })
      .cache((err) => {
        console.log(err);
      });
  });
};
// SOCKET
const http = require("http");
const socketio = require("socket.io");
const server = http.createServer(app);
const io = socketio(server);
const onlineUsers = {};
try {
  io.on("connection", (socket) => {
    // Get connected user id
    const userId = socket.handshake.query.userId;
    // Set user as online
    onlineUsers[userId] = socket.id;
    doEveryMinute(socket);
    getBalance(socket);
    deposit(socket, onlineUsers);
    approve(socket);
    reject(socket);
    tranferCrypto(socket);
    socket.on("user_logout", (item) => {
      socket.disconnect();
    });
    socket.on("disconnect", () => {
      console.log("client disconnect");
      let disconnectedUserId = null;
      // Remove disconnected user from online users
      for (prop in onlineUsers) {
        if (onlineUsers[prop] === socket.id) {
          disconnectedUserId = prop;
          delete onlineUsers[prop];
          break;
        }
      }
    });
  });
} catch (e) {}
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
