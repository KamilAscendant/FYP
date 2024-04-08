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

        //used for testing authentication
        case "authenticate":{
          console.log('okay');
          await this.authenticateUser('wazuh', 'wazuh');
          break;
        }

        //try and list all agents on the wazuh configuration
        case "list": {
          await this.listActiveAgents(turnContext);
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

  private async listActiveAgents(turnContext: TurnContext): Promise<void> {
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

      const agents = response.data.data.affected_items;
      if (agents.length > 0) {
        // mapping the relevant details onto the adaptive card body
        const agentItems = agents.map(agent => ({
            "type": "TextBlock",
            "wrap": true,
            "text": `**ID:** ${agent.id} \n**Name:** ${agent.name} \n**Status:** ${agent.status}`
        }));

        // Template for adaptive card
        let cardTemplate = {
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "version": "1.4",
            "body": [
                {
                    "type": "TextBlock",
                    "size": "Medium",
                    "weight": "Bolder",
                    "text": "Wazuh Agents"
                },
                {
                    "type": "Container",
                    "items": agentItems,
                    "id": "agentsContainer"
                }
            ]
        };

        await turnContext.sendActivity({
            attachments: [CardFactory.adaptiveCard(cardTemplate)]
        });
      } else {
        await turnContext.sendActivity("No active agents found.");
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
      await turnContext.sendActivity("An error occurred while retrieving the agent list.");
    }
}


  //this is meant to list the Agents. same VM network issue
  async listAgents(jwtToken: string): Promise<any> {
    const agentsEndpoint = 'https://${this.wazuhIP}:443/agents'; 

    try {
      const response = await axios.get(agentsEndpoint, {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }), // Disable SSL certificate validation, wazuh has issues with that (VERY UNSAFE ONLY FOR DEV)
      });

      return response.data; // Return the list of agents or error description
    } catch (error) {
      console.error('Error while listing agents:', error.response?.data || error.message);
      throw error; // Throw the error if encountered during the API call
    }
  }
  //loops through all returned agents, only stores certain values - can expand this later but wanted to keep it simple for now
  async processAgentsData(jwtToken: string): Promise<any[]> {
    try {
      // Retrieve the list of agents using the listAgents method
      const agentsData = await this.listAgents(jwtToken);

      // Create an empty array to store processed agents
      const agentsSmall: any[] = [];
      //loops through and only keeps id, name, ip, status
      for (const agent of agentsData.data.affected_items) {
        const smallAgent = {
          id: agent.id,
          name: agent.name,
          ip: agent.ip,
          status: agent.status,
        };
          agentsSmall.push(smallAgent);
      }

      return agentsSmall;
    } catch (error) {
      console.error('Error while processing agents', error);
      throw error;
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
  private async sendChangeIPCard(turnContext: TurnContext) {
    console.log("Sending cards (but not flowers)");
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
    // Log the incoming invoke action type
    console.log(`Received an Adaptive Card Invoke. Action type: ${invokeValue.action.type}`);

    // Extract the action verb from the invocation
    const actionVerb = invokeValue.action.verb;

    // Process the invoke based on the action verb
    switch (actionVerb) {
        case 'changeip':
            console.log(`Action Data: ${JSON.stringify(invokeValue.action.data)}`);
            // Call the method to handle the IP change with the input data
            await this.handleChangeIPResponse(turnContext, invokeValue.action.data);
            break;
        // Add other cases as needed for different verbs
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


