export const allowRoles = (...roles) => {
  return (req, res, next) => {
    console.log("ROLE:", req.user.role);
    console.log("ALLOWED:", roles);

    if (!roles.includes(req.user.role)) {
      console.log("FORBIDDEN");
      return res.status(403).json({ message: "Forbidden" });
    }

    console.log("PASS");
    next();
  };
};