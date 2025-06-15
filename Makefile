CC = cc
CFLAGS ?= -std=gnu23 -Ilib -O2 -Wall -Wextra -pedantic -Wno-stringop-truncation -g
SRC = $(wildcard src/*.c lib/*.c)
OBJ = $(SRC:.c=.o)
TARGET = simple-remote-control

$(TARGET): $(OBJ)
	$(CC) $(CFLAGS) $(OBJ) -o $(TARGET)

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f $(TARGET) $(OBJ)

install:
	cp $(TARGET) /usr/local/bin/

.PHONY: all clean install
