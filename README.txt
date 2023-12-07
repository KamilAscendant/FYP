This bot is based on the Basic Bot Template provided by the Microsoft Bot Framework SDK and developed using the tutorials from the Microsoft Website,
as cited in my report.
Currently, the code is non-functional for external users due to requiring a hardcoded Wazuh installation. However, if you wish to try and run it,
you will need to create one of your own.
To do so:
    Install RedHat Enterprise Linux on a Virtual machine   
    Adjust VM configuration to allow for external network connection
    Install Wazuh according to the QuickStart guide https://documentation.wazuh.com/current/quickstart.html
    Install Agents on another VM and connect them to the Wazuh Manager  
    Replace your Wazuh connection details and credentials as hard-coded into the bot, as these currently use mine
    Install Teams Toolkit and Microsoft Bot Framework SDK
    Replace env files 
    Press CTRL+Shift+D in Teams Toolkit to launch debugger in Edge
    Sign in with the username 'KalsinVandiir@slym6.onmicrosoft.com' and password 'V4l3nt1n3V4nd11r' OR make your own Azure dev account and copy
    this bot's files into there (make sure to regenerate env files)
    When this bot's development is complete, it will be published so that it can be installed freely. However, it is currently in active dev and 
    so I have not been able to publish it.