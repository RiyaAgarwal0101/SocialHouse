import sharp from "sharp";
import cloudinary from "../utils/cloudinary.js";
import { Post } from "../models/post.model.js";
import { User } from "../models/user.model.js";
import { Comment } from "../models/comment.model.js";
import { getReceiverSocketId, io } from "../socket/socket.js";

// Function to add a new post
export const addNewPost = async (req, res) => {
    try {
        const { caption } = req.body;
        const image = req.file;
        const authorId = req.id;

        // Validate that an image is provided
        if (!image) return res.status(400).json({ message: 'Image required' });

        // Optimize the uploaded image
        const optimizedImageBuffer = await sharp(image.buffer)
            .resize({ width: 800, height: 800, fit: 'inside' })
            .toFormat('jpeg', { quality: 80 })
            .toBuffer();

        // Convert buffer to Data URI format
        const fileUri = `data:image/jpeg;base64,${optimizedImageBuffer.toString('base64')}`;
        // Upload the image to Cloudinary
        const cloudResponse = await cloudinary.uploader.upload(fileUri);

        // Create a new post in the database
        const post = await Post.create({
            caption,
            image: cloudResponse.secure_url,
            author: authorId
        });

        // Update the user's post list
        const user = await User.findById(authorId);
        if (user) {
            user.posts.push(post._id);
            await user.save();
        }

        // Populate author details (excluding password)
        await post.populate({ path: 'author', select: '-password' });

        return res.status(201).json({
            message: 'New post added',
            post,
            success: true,
        })

    } catch (error) {
        console.log(error);
    }
}


// Function to get all posts
export const getAllPost = async (req, res) => {
    try {
        const posts = await Post.find().sort({ createdAt: -1 })
            .populate({ path: 'author', select: 'username profilePicture' })
            .populate({
                path: 'comments',
                sort: { createdAt: -1 },
                populate: {
                    path: 'author',
                    select: 'username profilePicture'
                }
            });
        return res.status(200).json({
            posts,
            success: true
        })
    } catch (error) {
        console.log(error);
    }
};


// Function to get posts by a specific user
export const getUserPost = async (req, res) => {
    try {
        const authorId = req.id;
        const posts = await Post.find({ author: authorId }).sort({ createdAt: -1 }).populate({
            path: 'author',
            select: 'username, profilePicture'
        }).populate({
            path: 'comments',
            sort: { createdAt: -1 },
            populate: {
                path: 'author',
                select: 'username, profilePicture'
            }
        });
        return res.status(200).json({
            posts,
            success: true
        })
    } catch (error) {
        console.log(error);
    }
}

// Function to like a post
export const likePost = async (req, res) => {
    try {
        const likerId = req.id;
        const postId = req.params.id; 
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: 'Post not found', success: false });

        // like logic started
        await post.updateOne({ $addToSet: { likes: likerId } });
        await post.save();

        // implement socket io for real time notification
        const user = await User.findById(likerId).select('username profilePicture');
         
        const postOwnerId = post.author.toString();

        if(postOwnerId !== likerId){
            // Emit a notification if the liker is not the post owner
            const notification = {
                type:'like',
                userId:likerId,
                userDetails:user,
                postId,
                message:'Your post was liked'
            }
            const postOwnerSocketId = getReceiverSocketId(postOwnerId);
            io.to(postOwnerSocketId).emit('notification', notification);
        }

        return res.status(200).json({message:'Post liked', success:true});
    } catch (error) {

    }
}

// Function to dislike a post
export const dislikePost = async (req, res) => {
    try {
        const userId = req.id; // ID of the user disliking the post
        const postId = req.params.id; // ID of the post being disliked
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: 'Post not found', success: false });

        // dislike logic - Remove the user's ID from the likes array
        await post.updateOne({ $pull: { likes: userId } });
        await post.save();

         // Implement socket.io for real-time 
        const user = await User.findById(userId).select('username profilePicture');
        const postOwnerId = post.author.toString();
        if(postOwnerId !== userId){
            // Emit a notification event for the post owner
            const notification = {
                type:'dislike',
                userId:userId,
                userDetails:user,
                postId,
                message:'Your post was disliked'
            }
            const postOwnerSocketId = getReceiverSocketId(postOwnerId);
            io.to(postOwnerSocketId).emit('notification', notification);
        }



        return res.status(200).json({message:'Post disliked', success:true});
    } catch (error) {

    }
}

// Function to add a comment to a post
export const addComment = async (req,res) =>{
    try {
        const postId = req.params.id;// ID of the post to comment on
        const userId = req.id;// ID of the user adding the comment

        const {text} = req.body;// Comment text

        const post = await Post.findById(postId);

        if(!text) return res.status(400).json({message:'text is required', success:false});

         // Create a new comment
        const comment = await Comment.create({
            text,
            author:userId,
            post:postId
        })

        await comment.populate({
            path:'author',
            select:"username profilePicture"
        });
        
        // Add the comment to the post's comments array
        post.comments.push(comment._id);
        await post.save();

        return res.status(201).json({
            message:'Comment added',
            comment,
            success:true
        })

    } catch (error) {
        console.log(error);
    }
};

// Function to get comments for a specific post
export const getCommentsOfPost = async (req,res) => {
    try {
        const postId = req.params.id;// ID of the post

        // Find comments associated with the post and populate author details
        const comments = await Comment.find({post:postId}).populate('author', 'username profilePicture');

        if(!comments) return res.status(404).json({message:'No comments found for this post', success:false});

        return res.status(200).json({success:true,comments});

    } catch (error) {
        console.log(error);
    }
}

// Function to delete a post
export const deletePost = async (req,res) => {
    try {
        const postId = req.params.id;
        const authorId = req.id;

        const post = await Post.findById(postId);
        if(!post) return res.status(404).json({message:'Post not found', success:false});

        // check if the logged-in user is the owner of the post
        if(post.author.toString() !== authorId) return res.status(403).json({message:'Unauthorized'});

         // Delete the post
        await Post.findByIdAndDelete(postId);

        // remove the post id from the user's post
        let user = await User.findById(authorId);
        user.posts = user.posts.filter(id => id.toString() !== postId);
        await user.save();

        // delete associated comments
        await Comment.deleteMany({post:postId});

        return res.status(200).json({
            success:true,
            message:'Post deleted'
        })

    } catch (error) {
        console.log(error);
    }
}

// Function to bookmark or unbookmark a post
export const bookmarkPost = async (req,res) => {
    try {
        const postId = req.params.id;
        const authorId = req.id;
        const post = await Post.findById(postId);
        if(!post) return res.status(404).json({message:'Post not found', success:false});
        
        const user = await User.findById(authorId);
        if(user.bookmarks.includes(post._id)){
            // already bookmarked -> remove from the bookmark
            await user.updateOne({$pull:{bookmarks:post._id}});
            await user.save();
            return res.status(200).json({type:'unsaved', message:'Post removed from bookmark', success:true});

        }else{
             // Post is not bookmarked, so add it to bookmarks
            await user.updateOne({$addToSet:{bookmarks:post._id}});
            await user.save();
            return res.status(200).json({type:'saved', message:'Post bookmarked', success:true});
        }

    } catch (error) {
        console.log(error);
    }
}