const express = require("express");
const authRouter = require("./auth");
const aiRouter = require("./ai");

const router = express.Router();

router.use("/auth", authRouter);
router.use("/", aiRouter);

module.exports = router;