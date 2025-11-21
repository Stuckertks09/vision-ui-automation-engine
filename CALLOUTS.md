Working curl callouts.

curl -X POST http://localhost:5005/api/agent/task \
  -H "Content-Type: application/json" \
  -d '{ "app": "linear", "task": "create a new project named TestProject18" }' 


curl -X POST http://localhost:5005/api/agent/task \
  -H "Content-Type: application/json" \
  -d '{
    "app": "notion",
    "task": "how to filter the search box by items created by kurtis stuckert"
  }' 

  curl -X POST http://localhost:5005/api/agent/task \
  -H "Content-Type: application/json" \
  -d '{
    "app": "notion",
    "task": "change the settings to open the last visted page on start"
  }' 

  curl -X POST http://localhost:PORT/api/agent/task \
  -H "Content-Type: application/json" \
  -d '{ "app": "linear", "task": "sort projects in descending order in the projects tab" }'