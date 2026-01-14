const User = require('../models/User');
const { calculateProfileCompletion } = require('../utils/profileCompletion');

async function getProfileCompletion(req, res) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await User.findById(userId)
    .select('name phone avatar location serviceType description portfolioImages profession services portfolio pricing');
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { percent, missingFields } = calculateProfileCompletion(user);
  return res.json({ profileCompletion: percent, missingFields, isCompleted: percent === 100 });
}

module.exports = { getProfileCompletion };
