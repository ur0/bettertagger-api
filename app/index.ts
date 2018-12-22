import express from "express";
import UserRouter from "./controllers/user";

const app: any = express();
const port: number = parseInt(process.env.PORT || "3000");

app.use(express.json());
app.use("/api/v1/users", UserRouter);
app.listen(port, () => {
  console.log(`Listening on http://0.0.0.0:${port}`);
});
