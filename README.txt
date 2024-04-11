This bot is based on the Basic Bot Template provided by the Microsoft Bot Framework SDK and developed using the tutorials from the Microsoft Website,
as cited in my report.
This bot makes use of code from the Microsoft Adaptive Card Generator (https://vnext.adaptivecards.io/designer)
If you want to run the bot:

    Install Wazuh according to the QuickStart guide https://documentation.wazuh.com/current/quickstart.html OR using the Wazuh OVA
        (https://documentation.wazuh.com/current/deployment-options/virtual-machine/virtual-machine.html)
    Install Agents on another VM and connect them to the Wazuh Manager 
    Install Teams Toolkit and Microsoft Bot Framework SDK
    Re-generate env files 
    Press CTRL+Shift+D in Teams Toolkit to launch debugger in Edge
    Sign in with the username 'KalsinVandiir@slym6.onmicrosoft.com' and password 'V4l3nt1n3V4nd11r' (linked to my Microsoft
    Authenticator, so if you wish to mimic the setup please contact me) OR make your own Azure dev account and copy
    this bot's files into there (make sure to regenerate env files)

If you want to run tests, npx jest