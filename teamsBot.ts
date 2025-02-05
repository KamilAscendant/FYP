import {
  TeamsActivityHandler,
  CardFactory,
  TurnContext,
  AdaptiveCardInvokeValue,
  AdaptiveCardInvokeResponse,
  TeamsInfo,
  MessageFactory,
} from "botbuilder";
import https from 'https'
import rawWelcomeCard from "./adaptiveCards/welcome.json";
import rawAgentCard from "./adaptiveCards/agents.json";
import { AdaptiveCards } from "@microsoft/adaptivecards-tools";
import rawSorryCard from "./adaptiveCards/Sorry.json";
//const agentListCardTemplate = require("./adaptiveCards/agentList.json");
import axios, { AxiosRequestConfig } from 'axios';
import { exec } from "child_process";
import { parse } from "path";
export interface DataInterface {
}

export class TeamsBot extends TeamsActivityHandler {
  runningAgents: any[] = [];
  currentAgent: number = 0;
  jwtToken: any;
  private wazuhIP: string = ''
  private username: string = '' 
  private password: string = ''

  private currentAgentIndex: number = 0;
  private agentList: any[] = [];
  private currentGroupIndex: number = 0;
  private groupList: any[] = [];

  constructor() {
    super();
    //const serverIP = 'https://192.168.1.110:55000/'
    //const wazuhEndpoint = `https://${this.wazuhIP}:55000/security/user/authenticate?raw=true`;

    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded;
      for (let count = 0; count < membersAdded.length; count++) {
        const member = membersAdded[count];
        if (member.name) {
          await context.sendActivity(`Hello ${member.name}! Welcome to Kamil's WazuhBot.`);
          await this.introInteraction(context);
          break;
        }
      }

      await next();
    });

    this.onMessage(async (turnContext, next) => {
      console.log("Running with Message Activity.");

      let txt = typeof turnContext.activity.text === 'string' ? turnContext.activity.text : '';

      const removedMentionText = TurnContext.removeRecipientMention(turnContext.activity);

      if (removedMentionText && typeof removedMentionText === 'string') {
        txt = removedMentionText.replace(/\n|\r/g, "").trim().toLowerCase(); // Normalize input to lowercase, remove newlines etc
      }

      console.log(txt);
      // Trigger command by IM text

      // if (txt.includes("hello") || txt.includes("hi") || txt.includes("hey")){
      //   return 'greeting';
      // } else if (txt.includes("list") && txt.includes("agents")) {
      //   return 'listAgents';
      // } else if (txt.includes("introduction") || txt.includes("intro")){
      //   return 'introduction';
      // } else if (txt.includes("help")){
      //   return 'help';
      // } else if (txt.includes("authenticate") || (txt.includes("auth"))){
      //   return 'authenticate';
      // } else if (txt.includes("manage") || (txt.includes("management"))){
      //   return 'agentManagement';
      // } else if ((txt.includes("view") && ((txt.includes("ip") || (txt.includes("server")))))){
      //   return 'serverAddress';
      // } 
      const getIntention = parseText(txt);
      console.log(parseText(txt));
      switch (getIntention) {
        case "greeting": {
          console.log('hmm'); //debugging
          const userName = turnContext.activity.from.name || 'user'; // Fallback to 'user' if the name isn't available
          const time = new Date().getHours();
          const timedHello = time < 12 ? 'Good morning' : time < 18 ? 'Good afternoon' : 'Good evening';
          const introMessage = `**${timedHello}, ${userName}! Welcome to WazuhBot**`
          await turnContext.sendActivity(introMessage);
          const card = AdaptiveCards.declareWithoutData(rawWelcomeCard).render();
          await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
          break;
        }

        //intro statement, in full release will be brought up to the first thing said
        case "introduction": {
          await this.introInteraction(turnContext);
          break
        }

        case "help": {
          await this.handleHelp(turnContext);
          break
        }

        //loads the card that gives you the choice between listing and deleting agents
        case "agentManagement": {
          const card = AdaptiveCards.declare<DataInterface>(rawAgentCard).render();
          await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
          break;
        }

        //used for authentication
        case "authenticate": {
          if (!this.username || !this.password) {
            await turnContext.sendActivity(`No valid credentials found. If you wish to store your credentials, use the command 'update details`);
            break;
          } else {
            console.log(`attempting to authenticate at ${this.wazuhIP} under username ${this.username}`);
            await this.authenticateUser(turnContext, this.username, this.password);
            break;
          }
        }

        //try and list all agents on the wazuh configuration
        case "listAgents": {
          await this.listAllAgents(turnContext);
          break;
        }

        // case "ping": {
        //   await this.handlePingCommand(turnContext);
        //   break;
        // }

        case "changeIP": {
          await this.sendChangeIPCard(turnContext);
          break;
        }

        case "serverAddress": {
          if (!this.wazuhIP) {
            await turnContext.sendActivity(`No server address for Wazuh is currently stored. If you wish to set up a new server address, please reply 'change ip'`);
            break;
          } else {
            await turnContext.sendActivity(this.wazuhIP);
            break;
          }
        }

        case "updateDetails": {
          await this.sendChangeDetailsCard(turnContext);
          break;
        }

        //only for testing
        case "username": {
          if (!this.username || !this.password) {
            await turnContext.sendActivity(`No valid credentials found. If you wish to store your credentials, use the command 'update details`);
            break;
          } else {
            await turnContext.sendActivity(this.username);
            break;
          }
        }

        case "restartAgent": {
          await this.sendRestartAgentCard(turnContext);
          break;
        }

        case "deleteAgent": {
          await this.sendDeleteAgentCard(turnContext);
          break;
        }

        case "getSca": {
          await this.getSCACard(turnContext);
          break;
        }

        case "viewSummary": {
          await this.getSummary(turnContext);
          break;
        }

        case "mitreGroupLookup": {
          await this.sendGroupLookupCard(turnContext);
          break;
        }
        case "logout": {
          await this.handleLogout(turnContext);
          break;
        }

        case "showProfile": {
          await this.generateProfile(turnContext);
          break;
        }

        case "revokeJWT": {
          await turnContext.sendActivity('Revoking JWT');
          await this.handleRevocation(turnContext);
          break;
        }

        case "logSummary": {
          await turnContext.sendActivity("Generating log summary. This can take a while.");
          await this.handleLogSummary(turnContext);
          break;
        }

        case "getManagerInfo": {
          await turnContext.sendActivity("Fetching Wazuh manager info");
          await this.handleGetManagerInfo(turnContext);
          break;
        }

        case "unknown": {
          await turnContext.sendActivity("Sorry, I didn't understand that. Please use 'Help' to view a list of commands");
        }
      }


      await next();
    });

    //automatic message on greeting new member in chat. This is from the template.
    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded;
      for (let cnt = 0; cnt < membersAdded.length; cnt++) {
        if (membersAdded[cnt].id) {
          await context.sendActivity('Hello there, friend!');
          //await context.sendActivity(membersAdded[cnt].id);
          const card = AdaptiveCards.declareWithoutData(rawWelcomeCard).render();
          await context.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
          break;
        }
      }
      await next();
    });
  }

  private async handleGetManagerInfo(turnContext: TurnContext) {
    if (!this.jwtToken) {
      await turnContext.sendActivity("Authentication required. Please use 'authenticate' first.");
      return;
    }
    const endpoint = `https://${this.wazuhIP}:55000/manager/info`;
    try {
      const response = await axios.get(endpoint, {
        headers: { 'Authorization': `Bearer ${this.jwtToken}` },
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      });

      const managerInfo = response.data.data.affected_items[0];
      if (managerInfo) {
        let cardTemplate = {
          "body": [
            {
              "type": "TextBlock",
              "text": "Manager Information",
              "wrap": true,
              "size": "Large",
              "weight": "Bolder"
            },
            {
              "type": "TextBlock",
              "text": `Path: ${managerInfo.path}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Version: ${managerInfo.version}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Compilation Date: ${managerInfo.compilation_date}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Type: ${managerInfo.type}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Max Agents: ${managerInfo.max_agents}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `OpenSSL Support: ${managerInfo.openssl_support}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Timezone Offset: ${managerInfo.tz_offset}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Timezone Name: ${managerInfo.tz_name}`,
              "wrap": true
            }
          ],
          "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
          "type": "AdaptiveCard",
          "version": "1.4",
        };

        await turnContext.sendActivity({
          attachments: [CardFactory.adaptiveCard(cardTemplate)]
        });
      } else {
        await turnContext.sendActivity("No manager information found.");
      }
    } catch (error) {
      console.error('Error fetching manager information', error);
      await turnContext.sendActivity("An error occurred.");
    }
  }


  private async handleHelp(turnContext: TurnContext) {
    const userManualUrl = "https://docs.google.com/document/d/1ROWjphhlBiYXnxizcDC__5Aaxw8OzukGxZwlzSa5xh0/edit?usp=sharing";
    const userManualText = "Click here to access the User Manual for WazuhBot.";
    await turnContext.sendActivity(`Sure! Here is the user manual for WazuhBot: [User Manual](${userManualUrl})`);
  }
  private async introInteraction(turnContext: TurnContext) {
    const userName = turnContext.activity.from.name || 'user'; // Fallback to 'user' if the name isn't available
    const time = new Date().getHours();
    const timedHello = time < 12 ? 'Good morning' : time < 18 ? 'Good afternoon' : 'Good evening';
    const introMessage = `**${timedHello}, ${userName}! Welcome to WazuhBot**  
      I'm a management chatbot for your Wazuh installation. Here's what you can do:  
      - **Type 'Authenticate'** to verify your access to the Wazuh server.  
      - **Type 'List'** to list all agents in your Wazuh installation.  
      - If you're new, try typing **'Help'** to see available commands.  

    For now, why don't you say **Hello**!`;
    await turnContext.sendActivity(introMessage);
  }



  private async handleLogout(turnContext: TurnContext) {
    if (!this.jwtToken) {
      this.wazuhIP = null;
      this.username = null;
      this.password = null;
      await turnContext.sendActivity("No JWT found. Credentials cleared and server address reset.");
      return;
    } else {
      const agentsEndpoint = `https://${this.wazuhIP}:55000/security/user/authenticate`;
      try {
        const response = await axios.delete(agentsEndpoint, {
          headers: { 'Authorization': `Bearer ${this.jwtToken}` },
          httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });
      } catch (error) {
        console.error('Error logging out', error);
        await turnContext.sendActivity("An error occurred while logging out.", error);
      }
      this.wazuhIP = null;
      this.username = null;
      this.password = null;
      this.jwtToken = null;
      await turnContext.sendActivity('Logged out successfully');
    }
  }
  private async handleRevocation(turnContext: TurnContext) {
    console.log('debug');
    if (!this.jwtToken) {
      await turnContext.sendActivity("No JWT found.");
      return;
    } else {
      const agentsEndpoint = `https://${this.wazuhIP}:55000/security/user/authenticate`;
      try {
        const response = await axios.delete(agentsEndpoint, {
          headers: { 'Authorization': `Bearer ${this.jwtToken}` },
          httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });
        this.jwtToken = null;
        await turnContext.sendActivity('All JWTs for active user revoked and cleared.');
      } catch (error) {
        console.error('Error logging out', error);
        await turnContext.sendActivity("An error occurred while revoking this active user's JWT.", error);
      }
    }
  }

  //tries to authenticate to Wazuh using the basic authentication from the API (see reference document)
  private async authenticateUser(turnContext: TurnContext, username, password) {
    const wazuhEndpoint = `https://${this.wazuhIP}:55000/security/user/authenticate`; //takes the wazuhIP stored - now works for diff setups
    await turnContext.sendActivity(`attempting to authenticate at ${wazuhEndpoint} under username ${this.username}`);
    try {
      const response = await axios.post(wazuhEndpoint, {}, {
        auth: {
          username: username,
          password: password,
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false
        })
      });

      const jwtToken = response.data.data.token;
      console.log('JWT token received:', jwtToken);
      this.jwtToken = jwtToken;
      if (!(!jwtToken)) {
        await turnContext.sendActivity('Authentication Successful!');
      };
      setTimeout(() => {
        this.jwtToken = null;
        console.log('Wazuh tokens are only valid for 900 seconds.'); //this can be changed, but 900 seemed sufficient
      }, 900 * 1000);

      return jwtToken;

    }
    catch (error) {
      await turnContext.sendActivity('Unable to authenticate');
      console.error('Error while authenticating user:', error.message);
      return null;
    }
  }

  private async listAllAgents(turnContext: TurnContext): Promise<void> {
    if (!this.jwtToken) {
      await turnContext.sendActivity("Authentication required. Please authenticate first.");
      return;
    }

    const agentsEndpoint = `https://${this.wazuhIP}:55000/agents`;
    try {
      const response = await axios.get(agentsEndpoint, {
        headers: { 'Authorization': `Bearer ${this.jwtToken}` },
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      });

      this.agentList = response.data.data.affected_items; // Store agents list
      this.currentAgentIndex = 0; // Reset index to start from the first agent

      if (this.agentList.length > 0) {
        // Call method to send an Adaptive Card for the current (first) agent
        await this.sendAgentInfoCard(turnContext);
      } else {
        await turnContext.sendActivity("No active agents found.");
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
      await turnContext.sendActivity("An error occurred while retrieving the agent list.");
    }
  }

  private async sendAgentInfoCard(turnContext: TurnContext) {
    if (this.agentList.length === 0) {
      await turnContext.sendActivity("No agents available.");
      return;
    }

    const agent = this.agentList[this.currentAgentIndex];
    const agentCard = {
      "type": "AdaptiveCard",
      "body": [
        {
          "type": "TextBlock",
          "text": `Agent Details`,
          "size": "Large",
          "weight": "Bolder"
        },
        {
          "type": "TextBlock",
          "text": `Name: ${agent.name}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `OS: ${agent.os.name}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `Date Added: ${agent.dateAdd}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `Manager: ${agent.manager}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `Last Keep Alive: ${agent.lastKeepAlive}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `Status: ${agent.status}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `IP: ${agent.ip}`,
          "wrap": true
        }
      ],
      "actions": [
        {
          "type": "Action.Execute",
          "title": "Previous",
          "verb": "showprev"
        },
        {
          "type": "Action.Execute",
          "title": "Next",
          "verb": "shownext"
        }
      ],
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "version": "1.4"
    };

    await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(agentCard)] });
  }

  private async getSummary(turnContext: TurnContext): Promise<void> {
    if (!this.jwtToken) {
      await turnContext.sendActivity("Authentication required. Please use 'authenticate' first.");
      return;
    }
    const endpoint = `https://${this.wazuhIP}:55000/agents/summary/status`;
    try {
      const response = await axios.get(endpoint, {
        headers: { 'Authorization': `Bearer ${this.jwtToken}` },
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      });

      const summary = response.data.data;
      if (summary) {
        // Assuming we only display the first item for simplicity
        const summaryDisplay = summary[0];
        let cardTemplate = {
          "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
          "type": "AdaptiveCard",
          "version": "1.4",
          "body": [
            {
              "type": "TextBlock",
              "text": "Connection Summary",
              "wrap": true,
              "size": "Large",
              "weight": "Bolder"
            },
            {
              "type": "TextBlock",
              "text": `Active: ${summary.connection.active}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Disconnected: ${summary.connection.disconnected}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Never Connected: ${summary.connection.never_connected}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Pending: ${summary.connection.pending}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Total Connections: ${summary.connection.total}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": "Config Summary",
              "wrap": true,
              "size": "Large",
              "weight": "Bolder",
              "separator": true
            },
            {
              "type": "TextBlock",
              "text": `Synced: ${summary.configuration.synced}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Not Synced: ${summary.configuration.not_synced}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Total Configurations: ${summary.configuration.total}`,
              "wrap": true
            }
          ]
        };

        await turnContext.sendActivity({
          attachments: [CardFactory.adaptiveCard(cardTemplate)]
        });
      } else {
        await turnContext.sendActivity("No summary found.");
      }
    } catch (error) {
      console.error('Error fetching summary', error);
      await turnContext.sendActivity("An error occurred while fetching the agent summary.");
    }
  }


  //handle the changeIP card being invoked
  private async handleChangeIPResponse(turnContext: TurnContext, data: any) {
    console.log(data.newIP);
    if (data.newIP) {
      this.wazuhIP = data.newIP;
      await turnContext.sendActivity(`The Wazuh IP has been updated to: ${data.newIP}`);
    } else {
      await turnContext.sendActivity("No new IP address provided.");
    }
  }

  private async sendChangeIPCard(turnContext: TurnContext) {
    console.log("Sending form to update server address");
    const changeIPCard = {
      "type": "AdaptiveCard",
      "body": [
        {
          "type": "TextBlock",
          "text": "Enter the new IP address of your Wazuh server:",
          "wrap": true
        },
        {
          "type": "Input.Text",
          "id": "newIP",
          "placeholder": "e.g., 192.168.1.110",
          "isRequired": true,
          "label": "Wazuh Server IP"
        }
      ],
      "actions": [
        {
          "type": "Action.Execute",
          "title": "Change IP",
          "verb": "changeip"
        }
      ],
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "version": "1.4"
    };

    await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(changeIPCard)] });
  }

  private async sendChangeDetailsCard(turnContext: TurnContext) {
    console.log("Sending form to update user details");
    const changeDetailsCard = {
      "type": "AdaptiveCard",
      "body": [
        {
          "type": "TextBlock",
          "text": "Enter your username and password",
          "wrap": true
        },
        {
          "type": "Input.Text",
          "id": "uName",
          "placeholder": "admin",
          "isRequired": true,
          "label": "Username"
        },
        {
          type: "Input.Text",
          "id": "pWord",
          "placeholder": "password1234",
          "isRequired": true,
          "label": "Password"
        }
      ],
      "actions": [
        {
          "type": "Action.Execute",
          "title": "Submit Details",
          "verb": "changedetails"
        }
      ],
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "version": "1.4"
    };

    await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(changeDetailsCard)] });
  }

  private async handleDetailsUpdate(turnContext: TurnContext, data: any) {
    console.log(data.uName);
    if (data.uName && data.pWord) {
      this.username = data.uName;
      this.password = data.pWord;
      await turnContext.sendActivity(`Thank you for providing your credentials. Username updated to: ${data.uName}`);
    } else {
      await turnContext.sendActivity('Invalid credentials provided. Please try again');
    }
  }

  private async sendRestartAgentCard(turnContext: TurnContext) {
    console.log("Sending form to restart Agent");
    const restartAgent = {
      "type": "AdaptiveCard",
      "body": [
        {
          "type": "TextBlock",
          "text": "Enter the ID of the Agent to be restarted:",
          "wrap": true
        },
        {
          "type": "Input.Text",
          "id": "restartID",
          "placeholder": "e.g., 001",
          "isRequired": true,
          "label": "Target Agent ID"
        }
      ],
      "actions": [
        {
          "type": "Action.Execute",
          "title": "Restart Agent",
          "verb": "restartID"
        }
      ],
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "version": "1.4"
    };

    await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(restartAgent)] });
  }

  private async sendDeleteAgentCard(turnContext: TurnContext) {
    console.log("Sending form to delete Agent");
    const restartAgent = {
      "type": "AdaptiveCard",
      "body": [
        {
          "type": "TextBlock",
          "text": "Enter the ID of the Agent to be deleted:",
          "wrap": true
        },
        {
          "type": "Input.Text",
          "id": "deleteID",
          "placeholder": "e.g., 001",
          "isRequired": true,
          "label": "Target Agent ID"
        }
      ],
      "actions": [
        {
          "type": "Action.Execute",
          "title": "Delete Agent",
          "verb": "deleteID"
        }
      ],
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "version": "1.4"
    };

    await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(restartAgent)] });
  }

  private async restartAgent(turnContext: TurnContext, data: any) {
    const endpoint = `https://${this.wazuhIP}:55000/agents/${data.restartID}/restart`;
    try {
      const response = await axios.put(endpoint, null, {
        headers: { 'Authorization': `Bearer ${this.jwtToken}` },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }) //self-signed SSL certificate issue - no idea how to bypass, Wazuh reference documents just say it's normal
      });
      console.log(response.status);
      if (response.status === 200) {
        await turnContext.sendActivity(`Agent with ID ${data.restartID} is being restarted.`);
        console.log(`Agent with ID ${data.restartID} successfully restarted`);
      } else {
        await turnContext.sendActivity(`Failed to restart agent with ID ${data.restartID}.`);
      }
    } catch (error) {
      console.error(`Error restarting agent with ID ${data.restartID}:`, error);
      await turnContext.sendActivity(`An error occurred while restarting agent with ID ${data.restartID}.`);
    }
  }

  private async deleteAgent(turnContext: TurnContext, data: Record<string, unknown>) {
    const endpoint = `https://${this.wazuhIP}:55000/agents?agents_list=${data.deleteID}&status=all&older_than=10s`;
    console.log('deleting agent');
    try {
      const response = await axios.delete(endpoint, {
        headers: { 'Authorization': `Bearer ${this.jwtToken}` },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }) //self-signed SSL certificate issue - no idea how to bypass, Wazuh reference documents just say it's normal
      });
      console.log(response.status);
      if (response.status === 200) {
        await turnContext.sendActivity(`Agent with ID ${data.deleteID} deleted.`);
        console.log(`Agent with ID ${data.deleteID} successfully deleted`);
      } else {
        await turnContext.sendActivity(`Failed to delete agent with ID ${data.deleteID}.`);
      }
    } catch (error) {
      console.error(`Error deleting agent with ID ${data.deleteID}:`, error);
      await turnContext.sendActivity(`An error occurred while deleting agent with ID ${data.deleteID}.`);
    }
  }

  private async getSCACard(turnContext: TurnContext) {
    console.log("Sending form to restart Agent");
    const SCACard = {
      "type": "AdaptiveCard",
      "body": [
        {
          "type": "TextBlock",
          "text": "Enter the ID of the Agent to fetch SCA info for:",
          "wrap": true
        },
        {
          "type": "Input.Text",
          "id": "scaID",
          "placeholder": "e.g., 001",
          "isRequired": true,
          "label": "Target Agent ID"
        }
      ],
      "actions": [
        {
          "type": "Action.Execute",
          "title": "Fetch SCA Info",
          "verb": "fetchsca"
        }
      ],
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "version": "1.4"
    };

    await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(SCACard)] });
  }

  private async fetchSCA(turnContext: TurnContext, data: any,) {
    if (!this.jwtToken) {
      await turnContext.sendActivity("Authentication required. Please authenticate first.");
      return;
    }

    const endpoint = `https://${this.wazuhIP}:55000/sca/${data.scaID}`;
    try {
      const response = await axios.get(endpoint, {
        headers: { 'Authorization': `Bearer ${this.jwtToken}` },
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      });

      const scaItem = response.data.data.affected_items[0];
      if (scaItem) {
        let cardTemplate = {
          "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
          "type": "AdaptiveCard",
          "version": "1.4",
          "body": [
            {
              "type": "TextBlock",
              "text": scaItem.name,
              "wrap": true,
              "size": "Large",
              "weight": "Bolder"
            },
            {
              "type": "TextBlock",
              "text": `Description: ${scaItem.description}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Total Checks: ${scaItem.total_checks}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Passed: ${scaItem.pass}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Failed: ${scaItem.fail}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Invalid: ${scaItem.invalid}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Score: ${scaItem.score}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `Start Scan: ${scaItem.start_scan}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `End Scan: ${scaItem.end_scan}`,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": `References: ${scaItem.references}`,
              "wrap": true,
              "maxLines": 3
            }
          ]
        };

        await turnContext.sendActivity({
          attachments: [CardFactory.adaptiveCard(cardTemplate)]
        });
      } else {
        await turnContext.sendActivity("No SCA details found for the specified agent.");
      }
    } catch (error) {
      console.error('Error fetching SCA details:', error);
      await turnContext.sendActivity("An error occurred while retrieving the SCA details.");
    }
  }

  private async sendGroupLookupCard(turnContext: TurnContext) {
    console.log("Sending form to update look up MITRE group");
    const groupCard = {
      "type": "AdaptiveCard",
      "body": [
        {
          "type": "TextBlock",
          "text": "MITRE Group Search",
          "wrap": true
        },
        {
          "type": "Input.Text",
          "id": "lookup",
          "placeholder": "e.g., North Korea, APT38, Lazarus",
          "isRequired": true,
          "label": "Search Term for MITRE group database"
        }
      ],
      "actions": [
        {
          "type": "Action.Execute",
          "title": "Search",
          "verb": "groupsearch"
        }
      ],
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "version": "1.4"
    };

    await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(groupCard)] });
  }

  private async groupLookup(turnContext: TurnContext, data: Record<string, unknown>) {
    if (!this.jwtToken) {
      await turnContext.sendActivity("Authentication required. Please authenticate first.");
      return;
    }

    const endpoint = `https://${this.wazuhIP}:55000/mitre/groups?search=${data.lookup}`;
    try {
      const response = await axios.get(endpoint, {
        headers: { 'Authorization': `Bearer ${this.jwtToken}` },
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      });

      this.groupList = response.data.data.affected_items;
      this.currentGroupIndex = 0;

      if (this.groupList.length > 0) {
        // Call method to send Adaptive Card for the current agent
        await this.sendGroupInfoCard(turnContext);
      } else {
        await turnContext.sendActivity("No results for search term");
      }
    } catch (error) {
      console.error('Error in lookup:', error);
      await turnContext.sendActivity("An error occurred while searching for your term");
    }
  }

  private async sendGroupInfoCard(turnContext: TurnContext) {
    if (this.groupList.length === 0) {
      await turnContext.sendActivity("No results");
      return;
    }

    const group = this.groupList[this.currentGroupIndex];
    const simpleGroupCard = {
      "type": "AdaptiveCard",
      "body": [
        {
          "type": "TextBlock",
          "text": `Group Details`,
          "size": "Large",
          "weight": "Bolder"
        },
        {
          "type": "TextBlock",
          "text": `Name: ${group.name}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `Description: ${group.description}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `MITRE Version: ${group.mitre_version}`,
          "wrap": true
        }
      ],
      "actions": [
        {
          "type": "Action.Execute",
          "title": "Previous",
          "verb": "prevgroup"
        },
        {
          "type": "Action.Execute",
          "title": "View Details",
          "verb": "groupdetails"
        },
        {
          "type": "Action.Execute",
          "title": "Next",
          "verb": "nextgroup"
        }
      ],
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "version": "1.4"
    };

    await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(simpleGroupCard)] });
  }

  private async generateProfile(turnContext: TurnContext) {
    const isAuthenticated = this.jwtToken ? "True" : "False";
    const profileCard = {
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "type": "AdaptiveCard",
      "version": "1.4",
      "body": [
        {
          "type": "TextBlock",
          "size": "Medium",
          "weight": "Bolder",
          "text": "Profile Information"
        },
        {
          "type": "FactSet",
          "facts": [
            {
              "title": "Wazuh Server:",
              "value": this.wazuhIP
            },
            {
              "title": "Username:",
              "value": this.username
            },
            {
              "title": "Authentication Status:",
              "value": isAuthenticated
            }
          ]
        }
      ],
      "actions": [
        {
          "type": "Action.Execute",
          "title": "Log Out",
          "verb": "logout"
        }
      ]
    };
    if (this.username == null && this.password == null && this.wazuhIP == null && isAuthenticated == 'False') {
      await turnContext.sendActivity('No details found.')
    } else {
      await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(profileCard)] });
    }
  }

  private async sendGroupDetailCard(turnContext: TurnContext) {
    const group = this.groupList[this.currentGroupIndex];
    const simpleGroupCard = {
      "type": "AdaptiveCard",
      "body": [
        {
          "type": "TextBlock",
          "text": `Group Details`,
          "size": "Large",
          "weight": "Bolder"
        },
        {
          "type": "TextBlock",
          "text": `Name: ${group.name}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `Description: ${group.description}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `MITRE Version: ${group.mitre_version}`,
          "wrap": true
        },
        {
          "type": "TextBlock",
          "text": `Software: ${group.software}`,
          "wrap:": true
        }
      ],
      "actions": [
        {
          "type": "Action.Execute",
          "title": "Previous",
          "verb": "prevgroup"
        },
        {
          "type": "Action.Execute",
          "title": "View Simplified",
          "verb": "groupsimple"
        },
        {
          "type": "Action.Execute",
          "title": "Next",
          "verb": "nextgroup"
        }
      ],
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "version": "1.4"
    };

    await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(simpleGroupCard)] });
  }

  private async handleLogSummary(turnContext: TurnContext): Promise<void> {
    if (!this.jwtToken) {
      await turnContext.sendActivity("Authentication required. Please authenticate first.");
      return;
    }
    const endpoint = `https://${this.wazuhIP}:55000/manager/logs/summary`; // Modify as per actual API
    try {
      const response = await axios.get(endpoint, {
        headers: { 'Authorization': `Bearer ${this.jwtToken}` },
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      });

      const logSummary = response.data.data.affected_items;
      await this.sendLogSummaryCard(turnContext, logSummary);
    } catch (error) {
      console.error('Error fetching log summary:', error);
      await turnContext.sendActivity("An error occurred while retrieving the log summary.");
    }
  }

  private async sendLogSummaryCard(turnContext: TurnContext, logSummary: any[]): Promise<void> {
    const cardElements = logSummary.map(log => {
      return {
        "type": "FactSet",
        "facts": [
          { "title": "Module:", "value": Object.keys(log)[0] },
          { "title": "Total:", "value": log[Object.keys(log)[0]].all.toString() },
          { "title": "Info:", "value": log[Object.keys(log)[0]].info.toString() },
          { "title": "Errors:", "value": log[Object.keys(log)[0]].error.toString() },
          { "title": "Critical:", "value": log[Object.keys(log)[0]].critical.toString() },
          { "title": "Warnings:", "value": log[Object.keys(log)[0]].warning.toString() },
          { "title": "Debugs:", "value": log[Object.keys(log)[0]].debug.toString() }
        ]
      };
    });

    const logSummaryCard = {
      "type": "AdaptiveCard",
      "body": [
        {
          "type": "TextBlock",
          "text": "Log Summary",
          "size": "Large",
          "weight": "Bolder"
        },
        ...cardElements
      ],
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "version": "1.4"
    };

    await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(logSummaryCard)] });
  }


  protected async onAdaptiveCardInvoke(turnContext: TurnContext, invokeValue: AdaptiveCardInvokeValue): Promise<AdaptiveCardInvokeResponse> {
    console.log(`Received an Adaptive Card Invoke.`);

    const actionVerb = invokeValue.action.verb;

    // Process the invoke based on the action verb, i.e. the name of the element used in the adaptive card
    switch (actionVerb) {
      case 'changeip':
        console.log(`Action Data: ${JSON.stringify(invokeValue.action.data)}`);
        await this.handleChangeIPResponse(turnContext, invokeValue.action.data);
        break;
      case 'changedetails':
        console.log(`New Credentials: ${JSON.stringify(invokeValue.action.data)}`);
        await this.handleDetailsUpdate(turnContext, invokeValue.action.data);
        break;
      case 'restartID':
        console.log(`Restarting agent with id ${JSON.stringify(invokeValue.action.data)}`);
        await this.restartAgent(turnContext, invokeValue.action.data);
        break;
      case 'deleteID':
        console.log(`Deleting agent with id ${JSON.stringify(invokeValue.action.data)}`);
        await this.deleteAgent(turnContext, invokeValue.action.data);
        break;
      case "shownext":
        this.currentAgentIndex = Math.min(this.currentAgentIndex + 1, this.agentList.length - 1);
        await this.sendAgentInfoCard(turnContext);
        break;
      case "showprev":
        this.currentAgentIndex = Math.max(this.currentAgentIndex - 1, 0);
        await this.sendAgentInfoCard(turnContext);
        break;
      case "listagents":
        await this.listAllAgents(turnContext);
        break;
      case "deleteagent":
        await this.sendDeleteAgentCard(turnContext);
        break;
      case "restartagent":
        await this.sendRestartAgentCard(turnContext);
        break;
      case "fetchsca":
        await turnContext.sendActivity(`Fetching SCA Information for Agent ${JSON.stringify(invokeValue.action.data)}`);
        await this.fetchSCA(turnContext, invokeValue.action.data);
        break;
      case "groupsearch":
        await turnContext.sendActivity(`Querying MITRE DB for ${JSON.stringify(invokeValue.action.data.lookup)}`)
        await this.groupLookup(turnContext, invokeValue.action.data);
        break;
      case "nextgroup":
        this.currentGroupIndex = Math.min(this.currentGroupIndex + 1, this.groupList.length - 1);
        await this.sendGroupInfoCard(turnContext);
        break;
      case "prevgroup":
        this.currentGroupIndex = Math.max(this.currentGroupIndex - 1, 0);
        await this.sendGroupInfoCard(turnContext);
        break;
      case "groupdetails":
        await this.sendGroupDetailCard(turnContext);
        break;
      case "groupsimple":
        await this.sendGroupInfoCard(turnContext);
        break;
      case "senddetailscard":
        await this.sendChangeDetailsCard(turnContext);
        break;
      case "sendipcard":
        await this.sendChangeIPCard(turnContext);
        break;
      case "sendhelp":
        await this.handleHelp(turnContext);
        break;
      case "logout":
        await turnContext.sendActivity('Logging out.');
        await this.handleLogout(turnContext);
        break;
      case "sendintro":
        await this.introInteraction(turnContext);
        break;
      case "revokeJWT":
        await this.handleRevocation(turnContext);
        break;
      default:
        console.log(`Unknown Adaptive Card action verb received: ${actionVerb}`);
        break;
    }

    // Return a response for the invoke action
    return {
      statusCode: 200,
      type: undefined,
      value: undefined
    };
  }

}


function parseText(txt) {
  if (txt.includes("hello") || txt.includes("hi") || txt.includes("hey")) {
    console.log('debug');
    return 'greeting';
  } else if (txt.includes("welcome")) {
    return 'greeting';
  } else if (txt.includes("list") && txt.includes("agents")) {
    return 'listAgents';
  } else if (txt.includes("introduction") || txt.includes("intro") || txt.includes("introduce")) {
    return 'introduction';
  } else if (txt.includes("help")) {
    return 'help';
  } else if (txt.includes("authenticate") || txt.includes("auth")) {
    return 'authenticate';
  } else if ((txt.includes("agent") || txt.includes("agents")) && (txt.includes("manage") || txt.includes("management"))) {
    return 'agentManagement';
  } else if (txt.includes("view") && (txt.includes("ip") || txt.includes("server") || txt.includes("address"))) {
    return 'serverAddress';
  } else if (txt.includes("change") && (txt.includes("ip") || txt.includes("address"))) {
    return 'changeIP';
  } else if ((txt.includes("change") || txt.includes("update")) && (txt.includes("details") || txt.includes("credentials"))) {
    return 'updateDetails';
  } else if (txt.includes("view") && (txt.includes("username") || txt.includes("credentials"))) {
    return 'username';
  } else if ((txt.includes("restart") || txt.includes("reboot")) && txt.includes("agent")) {
    return 'restartAgent';
  } else if (txt.includes("sca")) {
    return 'getSca';
  } else if ((txt.includes("summary") || txt.includes("summarise") || txt.includes("summarize")) && (txt.includes('config') || txt.includes('configuration') || txt.includes('agent'))) {
    return 'viewSummary';
  } else if (txt.includes("mitre") && txt.includes("group")) {
    return 'mitreGroupLookup';
  } else if (txt.includes("logout") || (txt.includes("log") && (txt.includes("out")))) {
    return 'logout';
  } else if ((txt.includes('view') || txt.includes('my') || txt.includes('show')) && (txt.includes('profile') || (txt.includes('account')))) {
    return 'showProfile';
  } else if ((txt.includes('delete') || txt.includes('remove')) && txt.includes('agent')) {
    return 'deleteAgent';
  } else if (txt.includes('log') && (txt.includes('summary') || txt.includes('summarise') || (txt.includes('summarize')))) {
    return 'logSummary';
  } else if (txt.includes('revoke') && (txt.includes('jwt') || txt.includes('token'))) {
    return 'revokeJWT';
  } else if (txt.includes('manager') && txt.includes('info')) {
    return 'getManagerInfo'
  } else {
    return 'unknown';
  }


}

