const { TeamsActivityHandler, TestAdapter } = require('botbuilder');
const { TeamsBot } = require('./teamsBot.ts');
const axios = require('axios');
jest.mock('axios');

const bot = new TeamsBot();
describe('TeamsBot Greeting on New Member Added', () => {
    it('should send a welcome message when a new member is added', async () => {
        const adapter = new TestAdapter(async (context) => await bot.run(context));
        const activity = {
          type: 'conversationUpdate',
          membersAdded: [{ id: '1', name: 'New User' }],
          channelId: 'msteams',
          recipient: { id: 'bot' },
          from: { id: '1', name: 'New User' }
        };
      
        await adapter.receiveActivity(activity);
        await adapter.send('hi') // Assuming 'hi' triggers the welcome process
          .assertReply("Hello New User! Welcome to Kamil's WazuhBot.");
      });
  });
  
  describe('Authentication Test', () => {
    it('should handle user authentication', async () => {
      axios.post.mockResolvedValue({ data: { data: { token: "mockToken" } } });
  
      const adapter = new TestAdapter(async (turnContext) => await bot.run(turnContext));
      await adapter.send('authenticate')
        .assertReply('attempting to authenticate at https://192.168.0.41:55000/security/user/authenticate under username wazuh')
        .assertReply('Authentication Successful!');
    });
  });

  describe('Help Command', () => {
    it('should return the help message', async () => {
      const adapter = new TestAdapter(async (turnContext) => await bot.run(turnContext));
      await adapter.send('help')
        .assertReply(helpTest);
    });
  });
  
    const userManualUrl = "https://docs.google.com/document/d/1ROWjphhlBiYXnxizcDC__5Aaxw8OzukGxZwlzSa5xh0/edit?usp=sharing";
    const userManualText = "Click here to access the User Manual for WazuhBot.";
    const helpTest = `Sure! Here is the user manual for WazuhBot: [User Manual](${userManualUrl})`