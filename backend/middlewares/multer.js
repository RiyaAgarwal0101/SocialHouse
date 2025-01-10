import multer from "multer";

// Configure Multer for file uploads
const upload = multer({
    storage:multer.memoryStorage(),
});
export default upload;