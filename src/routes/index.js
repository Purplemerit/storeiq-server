const express = require("express");
const authRouter = require("./auth");
const aiRouter = require("./ai");

const videoRouter = require("./video");
const scriptHistoryRouter = require("./scriptHistory");

const router = express.Router();

router.use("/auth", authRouter);
router.use("/", aiRouter);
router.use("/", videoRouter);
router.use("/scripts", scriptHistoryRouter);

module.exports = router;