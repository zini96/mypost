const express = require("express");
const cors = require("cors");
const { connect } = require("mongoose");
require("dotenv").config();
const upload = require("express-fileupload");

const userRoutes = require("./routes/userRoutes");
const postRoutes = require("./routes/postRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();
app.use(express.json({ extended: true }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({ credentials: true, origin: "http://localhost:3000" }));
app.use(upload());
//업로드할때 저장될 경로 설정 - uploads 폴더에 저장됩니다
app.use("/uploads", express.static(__dirname + "/uploads"));

//경로 설정
app.use("/api/users", userRoutes); //사용자경로
app.use("/api/posts", postRoutes); //포스트경로

//에러에 대한 경로 설정
app.use(notFound);
app.use(errorHandler);

//mongoDB에 연결하고 에러 발생시 콘솔에 에러 출력
connect(process.env.MONGO_URI)
  .then(
    app.listen(process.env.PORT || 5000, () =>
      console.log(`Server running on port ${process.env.PORT}`)
    )
  )
  .catch((error) => {
    console.log(error);
  });
