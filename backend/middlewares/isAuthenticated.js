import jwt from "jsonwebtoken";
const isAuthenticated = async (req,res,next)=>{
    try {
        // Retrieve the token from cookies
        const token = req.cookies.token;

         // Check if the token is present
        if(!token){
            return res.status(401).json({
                message:'User not authenticated',
                success:false
            });
        }

        // Verify the token using the secret key
        const decode = await jwt.verify(token, process.env.SECRET_KEY);
        // Check if the token is valid
        if(!decode){
            return res.status(401).json({
                message:'Invalid',
                success:false
            });
        }
        
        // Attach user ID to the request object for further use
        req.id = decode.userId;

        // Proceed to the next middleware or route handler
        next();
    } catch (error) {
        console.log(error);
    }
}
export default isAuthenticated;