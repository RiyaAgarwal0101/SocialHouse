import { Conversation } from "../models/conversation.model.js";
import { getReceiverSocketId, io } from "../socket/socket.js";
import { Message } from "../models/message.model.js";

// Function to send a message
export const sendMessage = async (req, res) => {
    try {
        const senderId = req.id;
        const receiverId = req.params.id;
        const { textMessage: message } = req.body;

        // Attempt to find an existing conversation
        let conversation = await Conversation.findOne({
            participants: { $all: [senderId, receiverId] }
        });

        // Create a new conversation if it doesn't exist
        if (!conversation) {
            conversation = await Conversation.create({
                participants: [senderId, receiverId]
            });
        }

        // Create a new message
        const newMessage = await Message.create({
            senderId,
            receiverId,
            message
        });

        // Add the new message to the conversation
        if (newMessage) {
            conversation.messages.push(newMessage._id);
        }

        // Save both the conversation and the new message
        await Promise.all([conversation.save(), newMessage.save()]);

        // Emit the new message via socket.io for real-time updates
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('newMessage', newMessage);
        }

        return res.status(201).json({
            success: true,
            newMessage
        });
    } catch (error) {
        console.error("Error sending message:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Function to get messages in a conversation
export const getMessage = async (req, res) => {
    try {
        const senderId = req.id;
        const receiverId = req.params.id;

        // Find the conversation between the sender and receiver
        const conversation = await Conversation.findOne({
            participants: { $all: [senderId, receiverId] }
        }).populate('messages');

        // If no conversation is found, return an empty messages array
        if (!conversation) {
            return res.status(200).json({ success: true, messages: [] });
        }

        return res.status(200).json({
            success: true,
            messages: conversation.messages || []
        });
        
    } catch (error) {
        console.error("Error retrieving messages:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
