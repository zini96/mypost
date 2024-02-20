const Post = require("../models/postModel");
const User = require("../models/userModel");
const path = require("path");
const fs = require("fs");
const { v4: uuid } = require("uuid");
const HttpError = require("../models/errorModel");

//create a post
//POST: api/posts
//PROTECTED
const createPost = async (req, res, next) => {
  try {
    let { title, category, desc } = req.body;

    //비어있지 않은지 확인(썸네일 필수)
    if (!title || !category || !desc || !req.files) {
      return next(
        new HttpError("Fill in all fields and choose thumbnail.", 422)
      );
    }

    //요청파일에서 thumbnail 가져오기
    const { thumbnail } = req.files;
    //파일 사이즈 확인
    if (thumbnail.size > 2000000) {
      return next(
        new HttpError("Thumbnail too big. File should be less than 2MB.", 422)
      );
    }

    //파일 이름을 thumbnail 이름과 동일하게 만들기
    let fileName = thumbnail.name;
    let splittedFilename = fileName.split(".");
    let newFilename =
      splittedFilename[0] +
      uuid() +
      "." +
      splittedFilename[splittedFilename.length - 1];

    //thumbnail을 uploads 폴더에 업로드
    thumbnail.mv(
      path.join(__dirname, "..", "/uploads", newFilename),
      async (err) => {
        if (err) {
          return next(new HttpError(err));
        } else {
          //새 게시물 생성
          const newPost = await Post.create({
            title,
            category,
            desc,
            thumbnail: newFilename,
            creator: req.user.id,
          });

          if (!newPost) {
            return next(new HttpError("Post couldn't be created.", 422));
          }
          //사용자를 찾고 게시물 수 +1
          const currentUser = await User.findById(req.user.id);
          const userPostCount = currentUser.posts + 1;
          //다시 데이터베이스에 +1된 게시물 수 보내주기
          await User.findByIdAndUpdate(req.user.id, { posts: userPostCount });

          res.status(201).json(newPost);
        }
      }
    );
  } catch (error) {
    return next(new HttpError(error));
  }
};

//get all post
//GET: api/posts
//UNPROTECTED
const getPosts = async (req, res, next) => {
  try {
    //게시물을 가장 최근 게시물 순서대로 가져오기
    const posts = await Post.find().sort({ updatedAt: -1 });
    res.status(200).json(posts);
  } catch (error) {
    return next(new HttpError(error));
  }
};

//get single post
//GET: api/posts/:id
//UNPROTECTED
const getPost = async (req, res, next) => {
  try {
    //게시물 아이디를 요청 매개변수에서 가져오기
    const postId = req.params.id;
    //데이터베이스에서 해당 ID를 가지는 post 가져오기
    const post = await Post.findById(postId);
    if (!post) {
      return next(new HttpError("Post not found.", 404));
    }

    res.status(200).json(post);
  } catch (error) {
    return next(new HttpError(error));
  }
};

//get posts by category
//GET: api/posts/categories/:category
//UNPROTECTED
const getCatPosts = async (req, res, next) => {
  try {
    //요청 매개변수에서 카테고리 가져오기
    const { category } = req.params;
    //가장 최근 게시물이 먼저 표시되도록 정렬
    const catPosts = await Post.find({ category }).sort({ createdAt: -1 });

    res.status(200).json(catPosts);
  } catch (error) {
    return next(new HttpError(error));
  }
};

//get author post
//GET : api/posts/users/:id
//UNPROTECTED
const getUserPosts = async (req, res, next) => {
  try {
    //요청 매개변수에서 유저/작성자 ID 가져오기
    const { id } = req.params;
    const posts = await Post.find({ creator: id }).sort({ createdAt: -1 });

    res.status(200).json(posts);
  } catch (error) {
    return next(new HttpError(error));
  }
};

//edit post
//PATCH: api/posts/:id
//PROTECTED
const editPost = async (req, res, next) => {
  try {
    let fileName;
    let newFilename;
    let updatedPost;
    const postId = req.params.id;

    let { title, category, desc } = req.body;

    //제목, 카테고리 필드가 비어있는지, desc가 12자 이상인지 체크
    if (!title || !category || desc.length < 12) {
      return next(new HttpError("Fill in all fields.", 422));
    }

    //기존 포스트 정보 불러오기
    const oldPost = await Post.findById(postId);

    //현재 로그인된 유저의 id가 기존 포스트의 작성자와 동일한지 확인
    if (req.user.id == oldPost.creator) {
      //file(=thumbnail) 변경이 없는 경우 기존의 thumbnail을 유지하고 업데이트
      if (!req.files) {
        updatedPost = await Post.findByIdAndUpdate(
          postId,
          { title, category, desc },
          { new: true }
        );
      } else {
        //새 thumbnail이 들어오는 경우

        // 기존이미지를 지우고
        fs.unlink(
          path.join(__dirname, "..", "uploads", oldPost.thumbnail),
          async (err) => {
            if (err) {
              return next(new HttpError(err));
            }
          }
        );
        //새 이미지 업로드
        const { thumbnail } = req.files;
        //파일사이즈 체크
        if (thumbnail.size > 2000000) {
          return next(
            new HttpError("Thumbnail too big. Should be less than 2MB.", 422)
          );
        }

        fileName = thumbnail.name;
        let splittedFilename = fileName.split(".");
        newFilename = splittedFilename[0] + uuid() + ".";
        splittedFilename[splittedFilename.length - 1];
        thumbnail.mv(
          path.join(__dirname, "..", "uploads", newFilename),
          async (err) => {
            if (err) {
              return next(new HttpError(err));
            }
          }
        );

        updatedPost = await Post.findByIdAndUpdate(
          postId,
          { title, category, desc, thumbnail: newFilename },
          { new: true }
        );
      }
    }

    if (!updatedPost) {
      return next(new HttpError("Couldn't update post.", 400));
    }

    res.status(200).json(updatedPost);
  } catch (error) {
    return next(new HttpError(error));
  }
};

//delete post
//DELETE: api/posts/:id
//PROTECTED
const deletePost = async (req, res, next) => {
  try {
    //게시물 ID 매개변수로 받아오기
    const postId = req.params.id;

    if (!postId) {
      return next(new HttpError("Post unavailable.", 400));
    }

    //데이터베이스에서 포스트 정보 가져오기
    const post = await Post.findById(postId);
    const fileName = post?.thumbnail;

    //삭제하려는 포스트의 작성자와 현재 로그인한 유저가 동일인물인지 확인
    if (req.user.id == post.creator) {
      //uploads 폴더에서 thumbnail 삭제하기
      fs.unlink(
        path.join(__dirname, "..", "uploads", fileName),
        async (err) => {
          if (err) {
            return next(new HttpError(err));
          } else {
            await Post.findByIdAndDelete(postId);
            //게시물 작성자 찾아서 post 수 하나 줄이기
            const currentUser = await User.findById(req.user.id);
            const userPostCount = currentUser?.posts - 1;
            await User.findByIdAndUpdate(req.user.id, { posts: userPostCount });
            res.json(`Post ${postId} deleted successfully.`);
          }
        }
      );
    }
  } catch (error) {
    return next(new HttpError(error));
  }
};

module.exports = {
  createPost,
  getPosts,
  getPost,
  getCatPosts,
  getUserPosts,
  editPost,
  deletePost,
};
