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
import axios, { AxiosRequestConfig } from 'axios';
export interface DataInterface {
}

export class TeamsBot extends TeamsActivityHandler {
  runningAgents:any[] = [];
  currentAgent: number = 0;
  constructor() {
    super();

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
      txt = removedMentionText.replace(/\n|\r/g, "").trim().toLowerCase(); // Normalize input to lowercase
    }

      console.log(txt);
      // Trigger command by IM text
      switch (txt) {
        //basic choice between event and agent viewer
        case "Hello": {
          console.log('hmm'); //debugging
          const card = AdaptiveCards.declareWithoutData(rawInitialiseCard).render();
          await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
          break;
        }

        //intro statement, in full release will be brought up to the first thing said
        case "Introduction":{
          await turnContext.sendActivity("Hi! I'm WazuhBot, a management chatbot for your Wazuh installation.");
          await turnContext.sendActivity("In full release this is where you'll input your user details and Wazuh installation");
          await turnContext.sendActivity("You can interact with me by typing commands like 'Agents' or 'List.'");
          await turnContext.sendActivity("If you're new, try typing 'Help' to see available commands.");
          await turnContext.sendActivity("For now, why don't you say Hello!");
        }

        case "Help": {
          await turnContext.sendActivity("Sure! Here are some commands you can use:");
          await turnContext.sendActivity("'Introduction': Learn more about WazuhBot.");
          await turnContext.sendActivity("'Agents': View and manage Wazuh agents.");
          await turnContext.sendActivity("'List': List all agents in your Wazuh installation.");
          break;
        }
        //loads the card that gives you the choice between listing and deleting agents
        case "Agents": {
          const card = AdaptiveCards.declare<DataInterface>(rawAgentCard).render();
          await turnContext.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
          break;
        }

        //used for testing authentication
        case "auth":{
          console.log('okay');
          const jwtToken = await this.authenticateUser('admin', 'S2o.z?5gX8A*8+AZoaTr4hGWZaUw5a6?'); 
          await turnContext.sendActivity(jwtToken);
          console.log(jwtToken)
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
  handlePingCommand(turnContext: TurnContext) {
    throw new Error("Method not implemented.");
  }
  private async listActiveAgents(turnContext: TurnContext): Promise<void> {
    const jwtToken = await this.authenticateUser('username', 'pwd'); //put new credentials here!! 
    if (!jwtToken) {
      await turnContext.sendActivity("Authentication failed!");
      return;
    }

    const apiUrl = ''; // ADD NEW API URL

    try {
      const response = await axios.get(apiUrl, {
        headers: { 'Authorization': `Bearer ${jwtToken}` },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }) 
      });

      if (response.data && response.data.data && response.data.data.affected_items) {
        const activeAgents = response.data.data.affected_items;
        const message = activeAgents.map(agent => `ID: ${agent.id}, Name: ${agent.name}, Status: ${agent.status}`).join('\n');
        await turnContext.sendActivity(`Active Agents:\n${message}`);
      } else {
        await turnContext.sendActivity("No active agents found.");
      }
    } catch (error) {
      console.error('Error fetching active agents:', error);
      await turnContext.sendActivity("An error occurred while retrieving the agent list.");
    }
  }

  //this is the handler for the events generated by clicking buttons on adaptive cards
  async onAdaptiveCardInvoke(
    context: TurnContext,
    invokeValue: AdaptiveCardInvokeValue
  ): Promise<AdaptiveCardInvokeResponse> {
    console.log(invokeValue.action.verb);
    //this is from clicking Agents in 'Hello'
    if (invokeValue.action.verb == "agentrequest") {
      const card = AdaptiveCards.declare<DataInterface>(rawAgentCard).render();
      await context.updateActivity({
        type: "message",
        id: context.activity.replyToId,
        attachments: [CardFactory.adaptiveCard(card)],
      });
      return { statusCode: 200, type: undefined, value: undefined };
    }
    //Sorry is a card that is meant for in-dev situations
    if (invokeValue.action.verb == "eventlist") {
      const card = AdaptiveCards.declare<DataInterface>(rawSorryCard).render();
      await context.updateActivity({
        type: "message",
        id: context.activity.replyToId,
        attachments: [CardFactory.adaptiveCard(card)],
      });
      return { statusCode: 200, type: undefined, value: undefined };
    }
    //inprogress is the default verb for cards I have not finished the functionality for yet
    if (invokeValue.action.verb == "inprogress") {
      const card = AdaptiveCards.declare<DataInterface>(rawSorryCard).render();
      await context.updateActivity({
        type: "message",
        id: context.activity.replyToId,
        attachments: [CardFactory.adaptiveCard(card)],
      });

      return { statusCode: 200, type: undefined, value: undefined };

    }
    //attempts to list all agents. hypothetically works but issues with VM network config means not functioning
    if (invokeValue.action.verb == "listagent"){
      console.log('whats wrong');
      const jwtToken = await this.authenticateUser('admin', 'S2o.z?5gX8A*8+AZoaTr4hGWZaUw5a6?'); 
      console.log('made it this far');
      const agentsList = await this.processAgentsData(jwtToken);
      console.log('so far so good')
      this.runningAgents = agentsList;
      await context.sendActivity('Agents list obtained and stored.');
    }
  }
  //tries to authenticate to Wazuh using the basic authentication from the API (see reference document)
  async authenticateUser(username: string, password: string): Promise<string | null> {
    const wazuhEndpoint = 'https://10.2.184.250:443/security/user/authenticate'; //hardcoded for my wazuh - change this to your own setup
    try {
      // Perform basic authentication to get the JWT token
      const response = await axios.post(
        wazuhEndpoint,
        {},
        {
          timeout:1500000,
          auth: {
            username: 'admin',
            password: '',
          },
          httpsAgent: new https.Agent({ rejectUnauthorized: false }), // Disable SSL certificate validation
        }
      );
      // Get JWT
      const jwtToken = response.data?.data?.token;

        if (jwtToken) {
        console.log('JWT token received:', jwtToken);
        return jwtToken; // Return the obtained JWT 
      } else {
        console.log('Authentication failed'); 
        return null; // Return null if no token
      }
    } catch (error) {
      console.error('Error while authenticating user:', error);
      return null; 
    }
  }
  //this is meant to list the Agents. same VM network issue
  async listAgents(jwtToken: string): Promise<any> {
    const agentsEndpoint = 'https://10.2.184.250:443/agents'; //hardcoded for my wazuh - change this to your own setup

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
}
