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
import rawInitialiseCard from "./adaptiveCards/initialise.json";
import rawAgentCard from "./adaptiveCards/agents.json";
import { AdaptiveCards } from "@microsoft/adaptivecards-tools";
import rawSorryCard from "./adaptiveCards/Sorry.json";
import rawagentListCard from "./adaptiveCards/agentList.json"
//const agentListCardTemplate = require("./adaptiveCards/agentList.json");
import axios, { AxiosRequestConfig } from 'axios';
import { exec } from "child_process";
export interface DataInterface {
}

export class TeamsBot extends TeamsActivityHandler {
  runningAgents:any[] = [];
  currentAgent: number = 0;
  jwtToken: any;
  private wazuhIP: string = '192.168.1.176' //default IP address, left in for ease of use
  private username: string = 'wazuh' //default credentials for Wazuh installations
  private password: string = 'wazuh'
  private currentAgentIndex: number = 0;
  private agentList: any[] = [];

  constructor() {
    super();
    //const serverIP = 'https://192.168.1.110:55000/'
    const wazuhEndpoint = `https://${this.wazuhIP}:55000/security/user/authenticate?raw=true`;

    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded;
      for (let count = 0; count < membersAdded.length; count++) {
        const member = membersAdded[count];
        if (member.name) {
          await context.sendActivity(`Hello ${member.name}! Welcome to Kamil's WazuhBot.`);
          break;
        }
      }
  
      await next();
    });

    this.onMessage(async (turnContext, next) => {
      console.log("Running with Message Activity.");

      let txt = turnContext.activity.text;
    const removedMentionText = TurnContext.removeRecipientMention(turnContext.activity);

    if (removedMentionText) {
      txt = removedMentionText.replace(/\n|\r/g, "").trim().toLowerCase(); // Normalize input to lowercase, remove newlines etc
    }

      console.log(txt);
      // Trigger command by IM text

      switch (txt) {

        case "hello": {
          console.log('hmm'); //debugging
          const card = AdaptiveCards.declareWithoutData(rawInitialiseCard).render();
          await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
          break;
        }

        //intro statement, in full release will be brought up to the first thing said
        case "introduction":{
          await this.introInteraction(turnContext);
          break
        }

        case "help": {
          await this.handleHelp(turnContext);
          break
        }

        //loads the card that gives you the choice between listing and deleting agents
        case "agents": {
          const card = AdaptiveCards.declare<DataInterface>(rawAgentCard).render();
          await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
          break;
        }

        //used for authentication
        case "authenticate":{
          console.log(`attempting to authenticate at ${this.wazuhIP} under username ${this.username}`);
          await this.authenticateUser(this.username, this.password);
          break;
        }

        //try and list all agents on the wazuh configuration
        case "list all": {
          await this.listAllAgents(turnContext);
          break;
        }

        case "ping": {
          await this.handlePingCommand(turnContext);
          break;
        }

        case "changeip": {
          await this.sendChangeIPCard(turnContext);
          break;
        }

        case "server address": {
          await turnContext.sendActivity(this.wazuhIP);
          break;
        }

        case "update details": {
          await this.sendChangeDetailsCard(turnContext);
          break;
        }

        //only for testing
        case "username": {
          await turnContext.sendActivity(this.username);
          break;
        }
        
        case "restart agent": {
          await this.sendRestartAgentCard(turnContext);
          break;
        }
        //meant for going to the next and previous agents while they are displayed
        //case "Next":{
         // await this.agentNavigation(turnContext, 'nextAgent');
          //break;
        //}
        //case "Back":{
          //await this.agentNavigation(turnContext, 'prevAgent');
          //break;
        //}
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
          const card = AdaptiveCards.declareWithoutData(rawInitialiseCard).render();
          await context.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
          break;
        }
      }
      await next();
    });
  }

  private async handleHelp(turnContext: TurnContext) {
    await turnContext.sendActivity("Sure! Here are some commands you can use:");
    await turnContext.sendActivity("'Introduction': Learn more about WazuhBot.");
    await turnContext.sendActivity("'Agents': View a list of all Wazuh agents.");
    await turnContext.sendActivity("'Authenticate': Input username and password to verify access to Wazuh server .");
    await turnContext.sendActivity("this is a placeholder - will be replaced with an adaptive card");
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

  private async handlePingCommand(turnContext: TurnContext): Promise<void> {
    // Execute the ping command
    exec('ping -c 4 8.8.8.8', (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            turnContext.sendActivity("Failed to ping 8.8.8.8");
            return;
        }

        // Send the result of the ping command back to the user
        // Note: stdout will contain the ping command output
        turnContext.sendActivity(`Ping result:\n\n${stdout}`);
    });
  }

  //tries to authenticate to Wazuh using the basic authentication from the API (see reference document)
  private async authenticateUser(username, password) {
    const wazuhEndpoint = `https://${this.wazuhIP}:55000/security/user/authenticate`; //takes the wazuhIP stored - now works for diff setups
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
      setTimeout(() => {
        this.jwtToken = null;
        console.log('Wazuh tokens are only valid for 900 seconds.'); //this can be changed, but 900 seemed sufficient
      }, 900 * 1000);

      return jwtToken;

    } 
      catch (error) {
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
    const card = {
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

    await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
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

  private async handleDetailsUpdate(turnContext: TurnContext, data: any){
    console.log(data.uName);
    if(data.uName && data.pWord){
      this.username = data.uName;
      this.password = data.pWord;
      await turnContext.sendActivity(`Thank you for providing your credentials. Username updated to: ${data.uName}`);
    } else{
      await turnContext.sendActivity('Invalid credentials provided. Please try again');
    }
  }

  //use the createAgentCard to make an adaptive card of the first agent in the array
  async displayAgentDetails(turnContext: TurnContext): Promise<void> {
    if (this.runningAgents.length > 0) {
      const agent = this.runningAgents[this.currentAgent];

      // Update Adaptive Card with agent details
      const adaptiveCard = this.createAgentCard(agent);
      await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(adaptiveCard)] });
    } else {
      await turnContext.sendActivity('No agents available.');
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

  private async restartAgent(turnContext: TurnContext, data:any) {
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
  
  //create an adaptive card to display an agent item. should have been its own card file, couldn't figure out how to make the import work
  createAgentCard(agent: any): any {
    return {
      type: 'AdaptiveCard',
      body: [
        {
          type: 'TextBlock',
          text: `Agent Details - ${agent.name}`,
          weight: 'bolder',
          size: 'medium',
        },
        {
          type: 'TextBlock',
          text: `Status: ${agent.status}`,
        },
        {
          type: 'TextBlock',
          text: `IP Address: ${agent.ip}`,
        },
        {
          type: 'TextBlock',
          text: `ID: ${agent.id}`,
        },
      ],
      actions: [
        {
          type: 'Action.Submit',
          title: 'Next Agent',
          data: {
            command: 'nextAgent',
          },
          visible: this.currentAgent < this.runningAgents.length - 1,
        },
        {
          type: 'Action.Submit',
          title: 'Previous Agent',
          data: {
            command: 'prevAgent',
          },
          visible: this.currentAgent > 0,
        },
      ],
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.4',
    };
  }

  //this should work for next and previous card displays
  async agentNavigation(turnContext: TurnContext, command: string): Promise<void> {
    switch (command) {
      case 'nextAgent':
        if (this.currentAgent < this.runningAgents.length - 1) {
          this.currentAgent++;
          await this.displayAgentDetails(turnContext);
        }
        break;
      case 'prevAgent':
        if (this.currentAgent > 0) {
          this.currentAgent--;
          await this.displayAgentDetails(turnContext);
        }
        break;
      default:
        break;
    }
  }

  //this is the handler for the events generated by clicking buttons on adaptive cards
  // protected async onAdaptiveCardInvoke(turnContext: TurnContext, invokeValue: AdaptiveCardInvokeValue): Promise<AdaptiveCardInvokeResponse> {
  //   const action = invokeValue.action;
  //   console.log('Adaptive Card Invoked');

  //   //this is from clicking Agents in 'Hello'
  //   if (action.verb == "agentrequest") {
  //     const card = AdaptiveCards.declare<DataInterface>(rawAgentCard).render();
  //     await turnContext.updateActivity({
  //       type: "message",
  //       id: turnContext.activity.replyToId,
  //       attachments: [CardFactory.adaptiveCard(card)],
  //     });
  //     return { statusCode: 200, type: undefined, value: undefined };
  //   }
  //   if (action && action.data && action.data.action === 'changeIP') {
  //     console.log('test');
  //     // Call the method to handle the IP change with the input data
  //     await this.handleChangeIPResponse(turnContext, action.data);
  //     console.log(action.data);
  //     return { statusCode: 200, type: undefined, value: undefined };
  // }
  //   //Sorry is a card that is meant for in-dev situations
  //   if (action.verb == "eventlist") {
  //     const card = AdaptiveCards.declare<DataInterface>(rawSorryCard).render();
  //     await turnContext.updateActivity({
  //       type: "message",
  //       id: turnContext.activity.replyToId,
  //       attachments: [CardFactory.adaptiveCard(card)],
  //     });
  //     return { statusCode: 200, type: undefined, value: undefined };
  //   }
  //   //inprogress is the default verb for cards I have not finished the functionality for yet
  //   if (action.verb == "inprogress") {
  //     const card = AdaptiveCards.declare<DataInterface>(rawSorryCard).render();
  //     await turnContext.updateActivity({
  //       type: "message",
  //       id: turnContext.activity.replyToId,
  //       attachments: [CardFactory.adaptiveCard(card)],
  //     });

  //     return { statusCode: 200, type: undefined, value: undefined };

  //   }
  //   //attempts to list all agents. hypothetically works but issues with VM network config means not functioning
  //   if (action.verb == "listagent"){
  //     console.log('whats wrong');
  //     const jwtToken = await this.authenticateUser('admin', 'S2o.z?5gX8A*8+AZoaTr4hGWZaUw5a6?'); 
  //     console.log('made it this far');
  //     const agentsList = await this.processAgentsData(jwtToken);
  //     console.log('so far so good')
  //     this.runningAgents = agentsList;
  //     await turnContext.sendActivity('Agents list obtained and stored.');
  //   }
  // }

  protected async onAdaptiveCardInvoke(turnContext: TurnContext, invokeValue: AdaptiveCardInvokeValue): Promise<AdaptiveCardInvokeResponse> {
    console.log(`Received an Adaptive Card Invoke.`);

    const actionVerb = invokeValue.action.verb;

    // Process the invoke based on the action verb, i.e. the name of the element used in the adaptive card
    switch (actionVerb) {
        case 'changeip':
            console.log(`Action Data: ${JSON.stringify(invokeValue.action.data)}`);
            // Call the method to handle the IP change with the input data
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
          case "shownext":
            this.currentAgentIndex = Math.min(this.currentAgentIndex + 1, this.agentList.length - 1);
            await this.sendAgentInfoCard(turnContext);
            break;
          case "showprev":
            this.currentAgentIndex = Math.max(this.currentAgentIndex - 1, 0);
            await this.sendAgentInfoCard(turnContext);
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


