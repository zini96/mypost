const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const { v4: uuid } = require("uuid");

const User = require("../models/userModel");
const HttpError = require("../models/errorModel");

//register a new user
//POST : api/users/register
//UNPROTECTED
const registerUser = async (req, res, next) => {
  try {
    const { name, email, password, password2 } = req.body;

    //입력필드가 비어있지 않은지 확인 후 비어있으면 에러메세지 출력
    if (!name || !email || !password) {
      return next(new HttpError("Fill in all fields.", 422));
    }

    //이메일 소문자로 변경
    const newEmail = email.toLowerCase();

    const emailExists = await User.findOne({ email: newEmail });

    //사용자가 이미 존재하는지 확인(이메일)후 이미 userData에 존재하는 이메일인 경우 에러메세지 출력
    if (emailExists) {
      return next(new HttpError("Email already exists.", 422));
    }

    //비밀번호 길이
    if (password.length < 6) {
      return next(
        new HttpError("Password should be at least 6 characters.", 422)
      );
    }

    //비밀번호 확인
    if (password != password2) {
      return next(new HttpError("Passwords do not match.", 422));
    }

    //bcryptjs로 사용자 비밀번호 암호화
    const salt = await bcrypt.genSalt(10);
    const hashedPass = await bcrypt.hash(password, salt);
    const newUser = await User.create({
      name,
      email: newEmail,
      password: hashedPass,
    });

    //올바른 회원가입 조건 모두 충족시
    res.status(201).json(`New user ${newUser.email} registered.`);
  } catch (error) {
    //사용자 입력이 올바르지 않다는것을 의미하는 에러메세지
    return next(new HttpError("User registration failed.", 422));
  }
};

//login a registered user
//POST : api/users/login
//UNPROTECTED
const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    //입력필드가 비어있는지 확인 후 에러메세지 출력
    if (!email || !password) {
      return next(new HttpError("Fill in all fields.", 422));
    }

    const newEmail = email.toLowerCase();

    //데이터베이스 유저정보에 해당 이메일이 들어있는지 = 가입이 되어 있는지 확인 후 에러메세지 출력
    const user = await User.findOne({ email: newEmail });
    if (!user) {
      return next(new HttpError("Invalid credentials - email.", 422));
    }

    //bcrypt가 입력한 비밀번호를 전달하고 데이터베이스에서 나온 비밀번호와 비교, 다른 경우 에러메세지 출력
    const comparePass = await bcrypt.compare(password, user.password);
    if (!comparePass) {
      return next(new HttpError("Invalid credentials - password.", 422));
    }

    //애플리케이션에 로그인을 위한 토큰 전달
    //사용자에게서 id와 이름 추출해서 토큰 생성
    const { _id: id, name } = user;
    const token = jwt.sign({ id, name }, process.env.JWT_SECRET, {
      //옵션으로 넣을수 있는 인수로, 토큰의 만료기간을 설정
      expiresIn: "1d",
    });

    //로그인 성공시
    res.status(200).json({ token, id, name });
  } catch (error) {
    return next(
      new HttpError("Login failed. Please check your credentials.", 422)
    );
  }
};

//user profile
//POST : api/users/:id
//PROTECTED
const getUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("-password");
    if (!user) {
      return next(new HttpError("User not found.", 404));
    }

    res.status(200).json(user);
  } catch (error) {
    new HttpError(error);
  }
};

//change user avatar(profile pic)
//POST : api/users/change-avatar
//PROTECTED
const changeAvatar = async (req, res, next) => {
  try {
    //파일의 형식이 잘못된 경우 - 이미지파일이 아닌경우
    if (!req.files.avatar) {
      return next(new HttpError("Please choose an image.", 422));
    }

    //로그인한 사용자에게만 일부 권한을 허용하는 인증 미들웨어를 사용해서 요청
    //데이터베이스에서 유저를 가져와서
    const user = await User.findById(req.user.id);

    //현재 로그인된 사용자가 이미 아바타를 가지고 있는지 확인하고 있다면 해당 아바다 제거/삭제
    if (user.avatar) {
      fs.unlink(path.join(__dirname, "..", "uploads", user.avatar), (err) => {
        if (err) {
          return next(new HttpError(err));
        }
      });
    }

    const { avatar } = req.files;
    //아바타 파일 사이즈 확인
    if (avatar.size > 500000) {
      return next(
        new HttpError(
          "Profile picture too bif. Should be less than 500kb.",
          422
        )
      );
    }

    //파일 이름이 동일해서 생길수있는 충돌을 방지하기 위해 파일 이름 변경해서 업로드하기
    let fileName;
    fileName = avatar.name;
    let splittedFilename = fileName.split(".");
    let newFilename =
      splittedFilename[0] +
      uuid() +
      "." +
      splittedFilename[splittedFilename.length - 1];
    avatar.mv(
      path.join(__dirname, "..", "uploads", newFilename),
      async (err) => {
        if (err) {
          return next(new HttpError(err));
        }

        const updatedAvatar = await User.findByIdAndUpdate(
          req.user.id,
          { avatar: newFilename },
          { new: true }
        );

        if (!updatedAvatar) {
          return next(new HttpError("Avatar couldn't be changed.", 422));
        }

        //성공적으로 아바타 업데이트
        res.status(200).json(updatedAvatar);
      }
    );
  } catch (error) {
    return next(new HttpError(error));
  }
};

//edit user details(profile)
//POST : api/users/edit-user
//PROTECTED
const editUser = async (req, res, next) => {
  try {
    const { name, email, currentPassword, newPassword, confirmNewPassword } =
      req.body;
    if (!name || !email || !currentPassword || !newPassword) {
      return next(new HttpError("Fill in all fields.", 422));
    }

    //유저데이터 데이터베이스에서 가져오기
    const user = await User.findById(req.user.id);
    if (!user) {
      return next(new HttpError("User not found.", 403));
    }

    //새 이메일이 데이터베이스에 존재하는지 확인(중복확잉)
    const emailExist = await User.findOne({ email });
    //이메일을 변경하거나 변경하지 않고 다른 세부 정보를 업데이트(로그인에 사용하기 때문에 고유 ID)
    if (emailExist && emailExist._id != req.user.id) {
      return next(new HttpError("Email already exist.", 422));
    }

    //현재 비밀번호를 데이터베이스에 있는 비밀번호와 비교
    const validateUserPassword = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!validateUserPassword) {
      return next(new HttpError("Invalid current password.", 422));
    }

    //새 비밀번호와 비교
    if (newPassword !== confirmNewPassword) {
      return next(new HttpError("New passwords do not match.", 422));
    }

    //hash new password
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);

    //데이터베이스 유저정보 업데이트
    const newInfo = await User.findByIdAndUpdate(
      req.user.id,
      { name, email, password: hash },
      { new: true }
    );

    res.status(200).json(newInfo);
  } catch (error) {
    return next(new HttpError(error));
  }
};

//get authors
//POST : api/users/authors
//UNPROTECTED
const getAuthors = async (req, res, next) => {
  try {
    //사용자정보에 대해 데이터베이스에서 불러올때 pw는 제외하기 - 보안상의 이유로
    const authors = await User.find().select("-password");
    res.json(authors);
  } catch (error) {
    return next(new HttpError(error));
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUser,
  changeAvatar,
  editUser,
  getAuthors,
};
